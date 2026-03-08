/**
 * drag.js — Pointer-event-based drag & drop
 *
 * Two drag modes:
 *   1. Panel-to-board: drag a card from the side panel onto the board surface
 *   2. Board reorder:  drag a card already on the board to reposition it
 *
 * Uses Pointer Events (not HTML Drag API) because:
 *   - HTML Drag API doesn't work with CSS transforms (zoom/pan)
 *   - Pointer Events give us full control and work on touch devices
 */

export function createDragSystem(board, surface, engine, options = {}) {
  const { createBoardCard } = options;
  const DRAG_THRESHOLD = 8;
  const CLICK_SUPPRESS_MS = 220;
  let activeDrag = null;    // { mode, el, ghost, startX, startY, offsetX, offsetY, cardData }
  let dropIndicator = null;
  let suppressClickUntil = 0;

  function init() {
    // Create drop indicator element
    dropIndicator = document.createElement('div');
    dropIndicator.className = 'drop-indicator';
    surface.appendChild(dropIndicator);
  }

  // ====== Panel-to-Board Drag ======

  function startPanelDrag(e, panelCard, cardData) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    panelCard.setPointerCapture?.(e.pointerId);

    activeDrag = {
      mode: 'panel-pending',
      el: panelCard,
      ghost: null,
      cardData,
      startX: e.clientX,
      startY: e.clientY,
    };
  }

  // ====== Board Card Drag ======

  function startBoardDrag(e, boardCard) {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    boardCard.setPointerCapture?.(e.pointerId);

    const cardId = boardCard.dataset.cardId;
    const boardPos = board.screenToBoard(e.clientX, e.clientY);

    // Get card's current position on the board
    const cardX = parseFloat(boardCard.style.left) || 0;
    const cardY = parseFloat(boardCard.style.top) || 0;

    activeDrag = {
      mode: 'board-pending',
      el: boardCard,
      ghost: null,
      cardId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: boardPos.x - cardX,
      offsetY: boardPos.y - cardY,
    };
  }

  // ====== Move Handler ======

  function handleMove(e) {
    if (!activeDrag) return;

    if (activeDrag.mode === 'panel-pending') {
      const moved = Math.hypot(e.clientX - activeDrag.startX, e.clientY - activeDrag.startY);
      if (moved < DRAG_THRESHOLD) return;
      beginPanelDrag(e);
    }

    if (activeDrag.mode === 'board-pending') {
      const moved = Math.hypot(e.clientX - activeDrag.startX, e.clientY - activeDrag.startY);
      if (moved < DRAG_THRESHOLD) return;
      beginBoardDrag();
    }

    if (activeDrag.mode === 'panel-to-board') {
      positionGhost(activeDrag.ghost, e.clientX, e.clientY);

      // Show drop indicator on board
      const viewport = document.getElementById('board-viewport');
      const rect = viewport.getBoundingClientRect();
      const isOverBoard = (
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom
      );

      if (isOverBoard) {
        const boardPos = board.screenToBoard(e.clientX, e.clientY);
        showDropIndicator(boardPos.x - 100, boardPos.y - 130, 200, 260);
      } else {
        hideDropIndicator();
      }

    } else if (activeDrag.mode === 'board-reorder') {
      const boardPos = board.screenToBoard(e.clientX, e.clientY);
      const newX = boardPos.x - activeDrag.offsetX;
      const newY = boardPos.y - activeDrag.offsetY;
      activeDrag.el.style.left = `${newX}px`;
      activeDrag.el.style.top = `${newY}px`;
    }
  }

  // ====== End Handler ======

  function handleEnd(e) {
    if (!activeDrag) return;

    if (activeDrag.mode === 'panel-pending') {
      engine.quickPlaceCard(activeDrag.cardData);
      cleanupDrag(e);
      return;
    }

    if (activeDrag.mode === 'board-pending') {
      cleanupDrag(e);
      return;
    }

    if (activeDrag.mode === 'panel-to-board') {

      // Check if dropped on board
      const viewport = document.getElementById('board-viewport');
      const rect = viewport.getBoundingClientRect();
      const isOverBoard = (
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom
      );

      if (isOverBoard) {
        const boardPos = board.screenToBoard(e.clientX, e.clientY);
        // Place the card on the board
        engine.placeCard(activeDrag.cardData, boardPos.x - 100, boardPos.y - 130);
        suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
      }

    } else if (activeDrag.mode === 'board-reorder') {
      activeDrag.el.classList.remove('is-dragging');
      activeDrag.el.classList.add('is-settling');
      setTimeout(() => activeDrag.el?.classList.remove('is-settling'), 300);

      // Update position in engine state
      const newX = parseFloat(activeDrag.el.style.left) || 0;
      const newY = parseFloat(activeDrag.el.style.top) || 0;
      engine.moveCard(activeDrag.cardId, newX, newY);
      suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
    }

    cleanupDrag(e);
  }

  // ====== Helpers ======

  function positionGhost(ghost, cx, cy) {
    ghost.style.left = `${cx - 90}px`;
    ghost.style.top = `${cy - 110}px`;
  }

  function beginPanelDrag(e) {
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';

    const cardEl = createBoardCard({
      ...activeDrag.cardData,
      cardId: 'ghost-preview',
    });
    cardEl.style.width = '180px';
    cardEl.style.minHeight = '220px';
    ghost.appendChild(cardEl);

    document.body.appendChild(ghost);
    positionGhost(ghost, e.clientX, e.clientY);

    activeDrag.mode = 'panel-to-board';
    activeDrag.ghost = ghost;
    document.body.style.userSelect = 'none';
    document.getElementById('board-viewport')?.classList.add('is-dragging-card');
  }

  function beginBoardDrag() {
    activeDrag.mode = 'board-reorder';
    activeDrag.el.classList.add('is-dragging');
    document.body.style.userSelect = 'none';
    document.getElementById('board-viewport')?.classList.add('is-dragging-card');
  }

  function showDropIndicator(x, y, w, h) {
    dropIndicator.style.left = `${x}px`;
    dropIndicator.style.top = `${y}px`;
    dropIndicator.style.width = `${w}px`;
    dropIndicator.style.height = `${h}px`;
    dropIndicator.classList.add('visible');
  }

  function hideDropIndicator() {
    dropIndicator.classList.remove('visible');
  }

  function cleanupDrag(e) {
    if (!activeDrag) return;
    activeDrag.ghost?.remove();
    hideDropIndicator();
    document.body.style.userSelect = '';
    document.getElementById('board-viewport')?.classList.remove('is-dragging-card');
    activeDrag.el?.releasePointerCapture?.(e.pointerId);
    activeDrag = null;
  }

  // ====== Global Listeners ======

  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleEnd);
  window.addEventListener('pointercancel', handleEnd);

  init();

  return {
    startPanelDrag,
    startBoardDrag,
    isActive: () => activeDrag !== null,
    shouldSuppressClick: () => Date.now() < suppressClickUntil,
  };
}
