/**
 * timeline.js — Timeline layout + SVG connection lines
 *
 * Manages the left-to-right timeline arrangement:
 *   Beginning card → Action cards → End Goal card
 *
 * Draws the main timeline plus attachment links for curveballs and ripples.
 */

const CARD_WIDTH = 200;
const CARD_HEIGHT = 260;
const CARD_GAP = 60;
const TIMELINE_Y = 1200;    // vertical center of the board
const TIMELINE_START_X = 400;

export function createTimeline(surface) {
  let svgLayer = null;

  function init() {
    // Create SVG overlay for connection lines
    svgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgLayer.id = 'connection-layer';
    svgLayer.setAttribute('width', '100%');
    svgLayer.setAttribute('height', '100%');
    svgLayer.style.position = 'absolute';
    svgLayer.style.top = '0';
    svgLayer.style.left = '0';
    svgLayer.style.pointerEvents = 'none';
    svgLayer.style.zIndex = '5';
    surface.appendChild(svgLayer);
  }

  /**
   * Calculate the auto-layout positions for timeline cards.
   * Cards are arranged left-to-right: Begin → Actions → End
   */
  function calculateLayout(cards) {
    const sorted = [];

    // Find beginning and end cards
    const beginCard = cards.find(c => c.type === 'beginning');
    const endCard = cards.find(c => c.type === 'end');
    const actionCards = cards.filter(c => c.type === 'action');

    if (beginCard) sorted.push(beginCard);
    sorted.push(...actionCards);
    if (endCard) sorted.push(endCard);

    // Assign positions
    const positions = {};
    sorted.forEach((card, i) => {
      positions[card.cardId] = {
        x: TIMELINE_START_X + i * (CARD_WIDTH + CARD_GAP),
        y: TIMELINE_Y - CARD_HEIGHT / 2,
      };
    });

    return { positions, order: sorted.map(c => c.cardId) };
  }

  function createPath(d, className) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', className);
    svgLayer.appendChild(path);
    return path;
  }

  function createCircle(cx, cy, className, radius = 7) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', String(cy));
    circle.setAttribute('r', String(radius));
    circle.setAttribute('class', className);
    svgLayer.appendChild(circle);
    return circle;
  }

  function drawTimelineConnections(timelineCards) {
    for (let i = 0; i < timelineCards.length - 1; i++) {
      const from = timelineCards[i];
      const to = timelineCards[i + 1];

      if (!from?.position || !to?.position) continue;

      const x1 = from.position.x + CARD_WIDTH;
      const y1 = from.position.y + CARD_HEIGHT / 2;
      const x2 = to.position.x;
      const y2 = to.position.y + CARD_HEIGHT / 2;
      const midX = (x1 + x2) / 2;

      createPath(
        `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`,
        'connection-line connection-line--timeline'
      );

      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      const arrowSize = 11;
      arrow.setAttribute(
        'points',
        `${x2},${y2} ${x2 - arrowSize * 1.7},${y2 - arrowSize} ${x2 - arrowSize * 1.7},${y2 + arrowSize}`
      );
      arrow.setAttribute('class', 'connection-arrow connection-arrow--timeline');
      svgLayer.appendChild(arrow);
    }
  }

  function drawAttachmentConnection(sourceCard, attachedCard) {
    if (!sourceCard?.position || !attachedCard?.position) return;

    const fromAbove = attachedCard.position.y < sourceCard.position.y;
    const startX = sourceCard.position.x + CARD_WIDTH / 2;
    const startY = fromAbove ? sourceCard.position.y : sourceCard.position.y + CARD_HEIGHT;
    const endX = attachedCard.position.x + CARD_WIDTH / 2;
    const endY = fromAbove ? attachedCard.position.y + CARD_HEIGHT : attachedCard.position.y;
    const curveStrength = Math.max(90, Math.abs(endY - startY) * 0.55);
    const controlY1 = fromAbove ? startY - curveStrength : startY + curveStrength;
    const controlY2 = fromAbove ? endY + curveStrength * 0.3 : endY - curveStrength * 0.3;
    const modifier = attachedCard.type === 'curveball'
      ? 'curveball'
      : attachedCard.type === 'ripple'
        ? 'ripple'
        : 'response';

    createPath(
      `M ${startX} ${startY} C ${startX} ${controlY1}, ${endX} ${controlY2}, ${endX} ${endY}`,
      `connection-line connection-line--${modifier}`
    );
    createCircle(startX, startY, `connection-node connection-node--${modifier}`, 6);
    createCircle(endX, endY, `connection-node connection-node--${modifier}`, 5);
  }

  /**
   * Draw connection lines for the timeline plus attached curveball/ripple cards.
   */
  function drawConnections(cards) {
    if (!svgLayer) return;

    while (svgLayer.firstChild) {
      svgLayer.removeChild(svgLayer.firstChild);
    }

    const byId = Object.fromEntries(cards.map((card) => [card.cardId, card]));
    const timelineCards = cards
      .filter((card) => ['beginning', 'end'].includes(card.type) || (card.type === 'action' && card.lane !== 'response'))
      .sort((a, b) => a.position.x - b.position.x);

    drawTimelineConnections(timelineCards);

    cards
      .filter((card) => (['curveball', 'ripple'].includes(card.type) || (card.type === 'action' && card.lane === 'response')) && card.linkedTo)
      .forEach((card) => drawAttachmentConnection(byId[card.linkedTo], card));
  }

  /**
   * Get a "next available" position for a new card being placed freely
   */
  function getNextFreePosition(existingCards) {
    if (existingCards.length === 0) {
      return { x: TIMELINE_START_X, y: TIMELINE_Y - CARD_HEIGHT / 2 };
    }

    // Find rightmost card
    let maxX = 0;
    existingCards.forEach(c => {
      const cx = c.position?.x || 0;
      if (cx > maxX) maxX = cx;
    });

    return {
      x: maxX + CARD_WIDTH + CARD_GAP,
      y: TIMELINE_Y - CARD_HEIGHT / 2,
    };
  }

  init();

  return {
    calculateLayout,
    drawConnections,
    getNextFreePosition,
    CARD_WIDTH,
    CARD_HEIGHT,
    CARD_GAP,
    TIMELINE_Y,
    TIMELINE_START_X,
  };
}
