/**
 * phases.js — Game Phase State Machine
 *
 * The game flows through 5 phases:
 *   setup → planning → curveball → ripple → reflection
 *
 * Each phase controls:
 *   - Which card types can be placed
 *   - Whether cards can be moved
 *   - What facilitator actions are available
 */

export const PHASES = [
  {
    id: 'setup',
    label: 'Setup',
    description: 'Define your starting situation and end goal',
    allowedCardTypes: ['beginning', 'end'],
    canMoveCards: true,
    color: 'var(--color-blue)',
  },
  {
    id: 'planning',
    label: 'Planning',
    description: 'Build your pathway with action cards',
    allowedCardTypes: ['action'],
    canMoveCards: true,
    color: 'var(--color-yellow)',
  },
  {
    id: 'curveball',
    label: 'Curveball',
    description: 'Face disruptions — drop curveballs onto your actions',
    allowedCardTypes: ['action', 'curveball'],
    canMoveCards: true,
    color: 'var(--color-red)',
  },
  {
    id: 'ripple',
    label: 'Ripple',
    description: 'Explore the consequences of your decisions',
    allowedCardTypes: ['action', 'curveball', 'ripple'],
    canMoveCards: true,
    color: 'var(--color-green)',
  },
  {
    id: 'reflection',
    label: 'Reflection',
    description: 'Review your timeline and discuss real next steps',
    allowedCardTypes: [],
    canMoveCards: false,
    color: 'var(--color-blue-dark)',
  },
];

export function createPhaseManager(onPhaseChange) {
  let currentIndex = 0;

  function getCurrentPhase() {
    return PHASES[currentIndex];
  }

  function getPhaseIndex() {
    return currentIndex;
  }

  function nextPhase() {
    if (currentIndex < PHASES.length - 1) {
      currentIndex++;
      onPhaseChange(getCurrentPhase(), currentIndex);
      return true;
    }
    return false;
  }

  function prevPhase() {
    if (currentIndex > 0) {
      currentIndex--;
      onPhaseChange(getCurrentPhase(), currentIndex);
      return true;
    }
    return false;
  }

  function setPhase(phaseId) {
    const idx = PHASES.findIndex(p => p.id === phaseId);
    if (idx !== -1) {
      currentIndex = idx;
      onPhaseChange(getCurrentPhase(), currentIndex);
    }
  }

  function canPlaceCardType(type) {
    const phase = getCurrentPhase();
    // In "free play" mode (no strict phases), allow all types
    return phase.allowedCardTypes.includes(type) || phase.allowedCardTypes.length === 0;
  }

  function canMoveCards() {
    return getCurrentPhase().canMoveCards;
  }

  return {
    getCurrentPhase,
    getPhaseIndex,
    nextPhase,
    prevPhase,
    setPhase,
    canPlaceCardType,
    canMoveCards,
    totalPhases: PHASES.length,
  };
}
