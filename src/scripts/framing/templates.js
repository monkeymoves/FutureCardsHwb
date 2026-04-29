/**
 * Framing templates — shape definitions, slot lists, and composeQuestion helper.
 *
 * The framing step (`/framing` route) lives ABOVE the game itself: groups agree
 * on the question they're exploring and the future state they want before any
 * cards hit the board. This module is the single source of truth for:
 *
 *   - which "tracks" a session can take (substantial vs. practical goal)
 *   - the three question shapes participants choose between
 *   - the slot fields each shape needs filled in
 *   - how those slot values compose into the final composedQuestion text
 *
 * Used by:
 *   - src/pages/framing.astro   — renders the form
 *   - src/scripts/game/engine.js — reads composedQuestion + goal for the topbar strip
 */

export const TRACKS = [
  {
    id: 'substantial',
    label: 'Substantial goal',
    helper: 'A societal, policy, or strategic outcome you want futures thinking to help reach.',
  },
  {
    id: 'practical',
    label: 'Practical goal',
    helper: 'You want to run a foresight process or exercise — the goal is the doing, not the destination.',
  },
];

// Help text shared across all shapes — kept here so we stay consistent if we
// reuse "system" or "horizon" in future shapes.
const HELPER_SYSTEM = 'The team, region, sector, or policy area you\'re working in.';
const HELPER_HORIZON = 'How far ahead — e.g. "5 years", "2031", or "12 months". Foresight works best when there\'s real uncertainty about the system itself, not just the actors. Longer horizons help, but shorter sprints can work if uncertainty is real.';

export const SHAPES = [
  {
    id: 'shape-future',
    label: 'Shape a future',
    blurb: 'You want to influence what happens next in your system.',
    template: 'How might [system] respond to [challenge] by [horizon]?',
    slots: [
      { id: 'system', label: 'System', helper: HELPER_SYSTEM, placeholder: 'e.g. Welsh public service boards' },
      { id: 'challenge', label: 'Challenge', helper: 'The real challenge, opportunity, or uncertainty driving the question.', placeholder: 'e.g. climate adaptation pressure' },
      { id: 'horizon', label: 'Horizon', helper: HELPER_HORIZON, placeholder: 'e.g. 5 years / 2031 / 12 months' },
    ],
  },
  {
    id: 'explore-consequences',
    label: 'Explore consequences',
    blurb: 'You want to stress-test what happens if a trend keeps going.',
    template: 'What might happen to [system] if [change] accelerates over [horizon]?',
    slots: [
      { id: 'system', label: 'System', helper: HELPER_SYSTEM, placeholder: 'e.g. our region\'s housing system' },
      { id: 'change', label: 'Change', helper: 'The trend, shock, or shift you want to test against.', placeholder: 'e.g. AI displacing entry-level jobs' },
      { id: 'horizon', label: 'Horizon', helper: HELPER_HORIZON, placeholder: 'e.g. 5 years / 2031' },
    ],
  },
  {
    id: 'find-pathways',
    label: 'Find pathways',
    blurb: 'You know where you want to end up — you need a route.',
    template: 'What would it take to move from [present state] to [desired future] by [horizon]?',
    slots: [
      { id: 'presentState', label: 'Present state', helper: 'Where things stand now — described concretely.', placeholder: 'e.g. fragmented adaptation planning' },
      { id: 'desiredFuture', label: 'Desired future', helper: 'The future state you want to make real.', placeholder: 'e.g. a single shared regional plan' },
      { id: 'horizon', label: 'Horizon', helper: HELPER_HORIZON, placeholder: 'e.g. 5 years / 2031' },
    ],
  },
];

export const QUICK_TEST = [
  {
    id: 'surprise',
    text: 'Could you imagine being genuinely surprised by where the game ends up?',
    failHint: 'If no, your question is too closed.',
  },
  {
    id: 'oneSentence',
    text: 'Could a colleague describe your goal in one sentence?',
    failHint: 'If no, it\'s too vague.',
  },
  {
    id: 'horizonFar',
    text: 'Is the horizon far enough out that the system itself could change, not just the actors in it?',
    failHint: 'If no, you\'re doing strategy, not foresight.',
  },
];

export function getShape(shapeId) {
  return SHAPES.find((s) => s.id === shapeId) || null;
}

/**
 * Compose the final question text by substituting filled slots into the
 * template. Empty slots fall back to the bracketed placeholder so the
 * facilitator can see at a glance what's still missing.
 */
export function composeQuestion(shapeId, slots = {}) {
  const shape = getShape(shapeId);
  if (!shape) return '';
  return shape.slots.reduce((text, slot) => {
    const value = (slots[slot.id] || '').trim();
    const replacement = value || `[${slot.label.toLowerCase()}]`;
    return text.replace(`[${slot.id}]`, replacement);
  }, shape.template);
}

export function emptyFraming() {
  return {
    track: null,
    shape: null,
    slots: {},
    composedQuestion: '',
    goal: '',
    quickTest: { surprise: false, oneSentence: false, horizonFar: false },
    completed: false,
  };
}
