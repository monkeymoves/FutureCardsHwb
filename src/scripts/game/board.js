/**
 * board.js — Zoom / Pan controller
 *
 * Controls the CSS transform on #board-surface so the player can scroll-zoom
 * and drag-pan around a large virtual canvas. All coordinate maths for
 * converting between screen-space (viewport pixels) and board-space
 * (position on the 4000x3000 canvas) live here.
 */

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.0;
const ZOOM_SENSITIVITY = 0.002;

export function createBoard(viewport, surface) {
  let scale = 0.7;
  let panX = -800;
  let panY = -500;
  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  let onChangeCallbacks = [];

  function applyTransform() {
    surface.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    onChangeCallbacks.forEach(cb => cb({ scale, panX, panY }));
  }

  /** Convert screen (viewport) coordinates to board-space coordinates */
  function screenToBoard(sx, sy) {
    const rect = viewport.getBoundingClientRect();
    return {
      x: (sx - rect.left - panX) / scale,
      y: (sy - rect.top - panY) / scale,
    };
  }

  /** Convert board coordinates to screen (viewport) coordinates */
  function boardToScreen(bx, by) {
    const rect = viewport.getBoundingClientRect();
    return {
      x: bx * scale + panX + rect.left,
      y: by * scale + panY + rect.top,
    };
  }

  // ---- Scroll wheel zoom (focal-point) ----
  function handleWheel(e) {
    e.preventDefault();

    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Board position under cursor before zoom
    const bx = (mouseX - panX) / scale;
    const by = (mouseY - panY) / scale;

    // Adjust scale
    const delta = -e.deltaY * ZOOM_SENSITIVITY;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * (1 + delta)));

    // Adjust pan so the point under cursor stays fixed
    panX = mouseX - bx * newScale;
    panY = mouseY - by * newScale;
    scale = newScale;

    applyTransform();
  }

  // ---- Pan (middle-click or pointer on background) ----
  function startPan(e) {
    // Only pan if clicking directly on the board surface or viewport
    // (not on a card or other interactive element)
    if (e.target !== viewport && e.target !== surface) {
      return false;
    }
    isPanning = true;
    panStart = { x: e.clientX - panX, y: e.clientY - panY };
    viewport.classList.add('is-panning');
    return true;
  }

  function movePan(e) {
    if (!isPanning) return;
    panX = e.clientX - panStart.x;
    panY = e.clientY - panStart.y;
    applyTransform();
  }

  function endPan() {
    if (!isPanning) return;
    isPanning = false;
    viewport.classList.remove('is-panning');
  }

  // ---- Public zoom methods ----
  function zoomIn() {
    const cx = viewport.clientWidth / 2;
    const cy = viewport.clientHeight / 2;
    const bx = (cx - panX) / scale;
    const by = (cy - panY) / scale;
    scale = Math.min(MAX_SCALE, scale * 1.25);
    panX = cx - bx * scale;
    panY = cy - by * scale;
    applyTransform();
  }

  function zoomOut() {
    const cx = viewport.clientWidth / 2;
    const cy = viewport.clientHeight / 2;
    const bx = (cx - panX) / scale;
    const by = (cy - panY) / scale;
    scale = Math.max(MIN_SCALE, scale / 1.25);
    panX = cx - bx * scale;
    panY = cy - by * scale;
    applyTransform();
  }

  function resetView() {
    scale = 0.7;
    panX = -800;
    panY = -500;
    applyTransform();
  }

  function fitToContent(cards, options = {}) {
    if (!cards || cards.length === 0) {
      resetView();
      return;
    }
    const {
      leftInset = 0,
      rightInset = 0,
      topInset = 0,
      bottomInset = 0,
    } = options;

    // Find bounding box of all cards
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    cards.forEach(c => {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + 200);
      maxY = Math.max(maxY, c.y + 260);
    });

    const contentW = maxX - minX + 200;
    const contentH = maxY - minY + 200;
    const vw = viewport.clientWidth - leftInset - rightInset;
    const vh = viewport.clientHeight - topInset - bottomInset;

    scale = Math.min(vw / contentW, vh / contentH, 1.0);
    scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * 0.85));
    panX = leftInset + (vw - contentW * scale) / 2 - minX * scale + 100 * scale;
    panY = topInset + (vh - contentH * scale) / 2 - minY * scale + 100 * scale;
    applyTransform();
  }

  // ---- Event listeners ----
  viewport.addEventListener('wheel', handleWheel, { passive: false });
  viewport.addEventListener('pointerdown', (e) => {
    if (startPan(e)) {
      e.preventDefault();
    }
  });
  window.addEventListener('pointermove', movePan);
  window.addEventListener('pointerup', endPan);

  // Initial transform
  applyTransform();

  return {
    screenToBoard,
    boardToScreen,
    zoomIn,
    zoomOut,
    resetView,
    fitToContent,
    applyTransform,
    getScale: () => scale,
    getState: () => ({ scale, panX, panY }),
    onChange(cb) { onChangeCallbacks.push(cb); },
  };
}
