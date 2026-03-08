/**
 * card.js — Card DOM creation
 *
 * Creates board-ready card elements using the design system from cards.css.
 * Each card type gets its own SVG icon drawn in an xkcd-ish hand-drawn style.
 * Uses safe DOM construction (no innerHTML) to prevent XSS.
 */

/** SVG icon markup per card type (hand-drawn style) — these are trusted static strings */
const ICON_MARKUP = {
  beginning: '<circle cx="28" cy="28" r="18" stroke-dasharray="4 3"/><path d="M28 16 v24 M20 28 h16"/><circle cx="28" cy="28" r="4" fill="rgba(255,255,255,0.3)"/>',
  end: '<path d="M18 14 h20 v8 h-20 z" fill="rgba(255,255,255,0.2)"/><line x1="18" y1="14" x2="18" y2="44"/><circle cx="28" cy="38" r="6" stroke-dasharray="3 2"/><path d="M25 38 l2 2 4-4" stroke-width="2.5"/>',
  action: '<path d="M16 40 v-16 l12-14 l12 14 v16" fill="rgba(0,0,0,0.08)"/><path d="M20 40 v-14 l8-10 l8 10 v14"/><line x1="28" y1="30" x2="28" y2="40"/><circle cx="28" cy="26" r="3"/>',
  curveball: '<path d="M24 12 l-2 14 h-6 l12 20 l12-20 h-6 l-2-14 z" fill="rgba(255,255,255,0.12)"/><path d="M26 14 l-1 12 h-5 l8 14 l8-14 h-5 l-1-12 z"/>',
  ripple: '<circle cx="28" cy="28" r="5" fill="rgba(255,255,255,0.25)"/><circle cx="28" cy="28" r="12" stroke-dasharray="4 3"/><circle cx="28" cy="28" r="20" stroke-dasharray="4 4" opacity="0.5"/>',
};

/** Additional action-card icon variations for visual variety */
const ACTION_ICON_VARIANTS = [
  '<circle cx="28" cy="18" r="8"/><path d="M16 44 c0-10 8-14 12-14 s12 4 12 14"/>',
  '<rect x="14" y="10" width="28" height="36" rx="2"/><line x1="20" y1="20" x2="36" y2="20"/><line x1="20" y1="27" x2="32" y2="27"/><line x1="20" y1="34" x2="28" y2="34"/>',
  '<circle cx="20" cy="20" r="6"/><circle cx="36" cy="20" r="6"/><path d="M10 40 c0-8 6-11 10-11 s10 3 10 11"/><path d="M26 40 c0-8 6-11 10-11 s10 3 10 11" opacity="0.6"/>',
  '<circle cx="24" cy="24" r="12"/><line x1="32" y1="32" x2="44" y2="44" stroke-width="3"/>',
  '<circle cx="28" cy="28" r="8" stroke-dasharray="3 2"/><circle cx="28" cy="28" r="14"/><line x1="28" y1="10" x2="28" y2="16"/><line x1="28" y1="40" x2="28" y2="46"/><line x1="10" y1="28" x2="16" y2="28"/><line x1="40" y1="28" x2="46" y2="28"/>',
  '<circle cx="28" cy="28" r="18"/><path d="M24 20 c-4 0-6 3-6 5 s2 5 10 6 s10 3 10 6 s-2 5-6 5" fill="none"/><line x1="28" y1="14" x2="28" y2="42"/>',
  '<path d="M14 26 h6 l16-8 v24 l-16-8 h-6 z" fill="rgba(0,0,0,0.06)"/><path d="M16 28 h4 l14-6 v20 l-14-6 h-4 z"/>',
  '<polyline points="12,40 20,30 28,34 36,18 44,24"/><line x1="12" y1="44" x2="44" y2="44"/><line x1="12" y1="14" x2="12" y2="44"/>',
];

const TYPE_LABELS = {
  beginning: 'Begin',
  end: 'End Goal',
  action: 'Action',
  curveball: 'Curveball',
  ripple: 'Ripple',
};

/**
 * Pick an icon variant for action cards based on ID (for visual variety)
 */
function getActionIconMarkup(cardId) {
  if (!cardId) return ICON_MARKUP.action;
  let hash = 0;
  for (let i = 0; i < cardId.length; i++) {
    hash = ((hash << 5) - hash) + cardId.charCodeAt(i);
  }
  return ACTION_ICON_VARIANTS[Math.abs(hash) % ACTION_ICON_VARIANTS.length];
}

/**
 * Create an SVG icon element from trusted static markup
 */
function createIconSvg(type, cardId) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 56 56');

  // These are trusted static strings from our codebase, not user input
  const markup = type === 'action' ? getActionIconMarkup(cardId) : (ICON_MARKUP[type] || ICON_MARKUP.action);
  const temp = document.createElementNS(svgNS, 'svg');
  temp.setAttributeNS(null, 'viewBox', '0 0 56 56');

  // Use DOMParser for safe SVG parsing of our static trusted content
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56">${markup}</svg>`,
    'image/svg+xml'
  );
  const parsed = doc.documentElement;

  // Move children from parsed SVG to our new SVG element
  while (parsed.firstChild) {
    svg.appendChild(parsed.firstChild);
  }

  return svg;
}

/**
 * Get the CSS class modifier for a card type
 */
function typeClass(type) {
  const map = {
    beginning: 'card--beginning',
    end: 'card--end',
    action: 'card--action',
    curveball: 'card--curveball',
    ripple: 'card--ripple',
  };
  return map[type] || '';
}

/**
 * Create a full card DOM element ready for the board.
 * Uses safe DOM construction — no innerHTML with user content.
 */
export function createBoardCard(cardData) {
  const { type, title, description, cardId, isEditable = false } = cardData;

  const card = document.createElement('div');
  card.className = `card board-card ${typeClass(type)}`;
  card.dataset.cardId = cardId || '';
  card.dataset.cardType = type;

  // Card top (coloured panel)
  const cardTop = document.createElement('div');
  cardTop.className = 'card-top';

  const iconWrap = document.createElement('div');
  iconWrap.className = 'card-icon';
  iconWrap.appendChild(createIconSvg(type, cardId || title));
  cardTop.appendChild(iconWrap);

  const typeLabel = document.createElement('span');
  typeLabel.className = 'card-type-label';
  typeLabel.textContent = TYPE_LABELS[type] || type;
  cardTop.appendChild(typeLabel);

  // Card body (white content area)
  const cardBody = document.createElement('div');
  cardBody.className = 'card-body';

  const titleEl = document.createElement('div');
  titleEl.className = 'card-title';
  titleEl.textContent = title;
  cardBody.appendChild(titleEl);

  if (description || isEditable) {
    const descEl = document.createElement('div');
    descEl.className = 'card-desc';
    descEl.textContent = description;
    cardBody.appendChild(descEl);
  }

  const linkBadge = document.createElement('div');
  linkBadge.className = 'card-link-badge';
  linkBadge.hidden = true;
  cardBody.appendChild(linkBadge);

  const ownerBadge = document.createElement('div');
  ownerBadge.className = 'card-owner-badge';
  ownerBadge.hidden = true;
  cardBody.appendChild(ownerBadge);

  // Footer action bar — drag handle on left, link button on right
  const footerBar = document.createElement('div');
  footerBar.className = 'card-footer-bar';

  const dragHandle = document.createElement('div');
  dragHandle.className = 'card-drag-handle';
  dragHandle.textContent = '⠿ drag';
  dragHandle.setAttribute('aria-hidden', 'true');
  footerBar.appendChild(dragHandle);

  const linkBtn = document.createElement('button');
  linkBtn.className = 'card-link-btn';
  linkBtn.type = 'button';
  linkBtn.title = 'Draw a connection from this card to another';
  linkBtn.textContent = '⤴ Link';
  footerBar.appendChild(linkBtn);

  card.appendChild(cardTop);
  card.appendChild(cardBody);
  card.appendChild(footerBar);

  return card;
}

/**
 * Create a panel card (compact list item for the side tray)
 */
export function createPanelCard(cardData) {
  const { type, title, description, id } = cardData;

  const card = createBoardCard({
    type,
    title,
    description,
    cardId: id || title,
  });

  card.classList.remove('board-card');
  card.classList.add('panel-card', 'card--mini');
  card.dataset.type = type;
  card.dataset.libraryId = id;
  card.draggable = false; // We use pointer events, not HTML drag

  return card;
}

export { ICON_MARKUP, typeClass };
