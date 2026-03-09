/**
 * engine.js — board orchestration
 *
 * The board now works as a lightweight futures exercise:
 *   - build a pathway
 *   - attach disruptions and consequences to that pathway
 *   - capture short notes as the session unfolds
 */

import { createBoard } from './board.js';
import { createBoardCard, createPanelCard } from './card.js';
import { createDragSystem } from './drag.js';
import { createTimeline } from './timeline.js';
import { createPhaseManager, PHASES } from './phases.js';
import { ACTION_CARDS, CURVEBALL_CARDS, RIPPLE_CARDS } from '../data/card-library.js';
import { generateCardId } from '../utils/id.js';

const PANEL_TYPES = ['action', 'curveball', 'ripple'];
const CARD_LIBRARY = {
  action: ACTION_CARDS,
  curveball: CURVEBALL_CARDS,
  ripple: RIPPLE_CARDS,
};

const PHASE_NOTE_PROMPTS = {
  setup: 'What future issue are you exploring, and what does a good outcome look like?',
  planning: 'Why does this pathway make sense, and where does it still feel fragile?',
  curveball: 'What changed when disruption hit, and how did the group adapt?',
  ripple: 'Which knock-on effects matter most, and what should people watch for?',
  reflection: 'What should the group do next, and what signal would tell you the future is shifting?',
};

const CARD_NOTE_PROMPTS = {
  beginning: 'Why is this the real starting condition?',
  end: 'How will you know this future has been reached?',
  action: 'Why is this move important in the pathway?',
  curveball: 'How does the group respond when this disruption lands?',
  ripple: 'What should people monitor or discuss because of this effect?',
};

// Discussion questions the facilitator reads aloud at the start of each phase.
// Separate from PHASE_NOTE_PROMPTS (those are for the written notebook).
const PHASE_FACILITATION_PROMPTS = {
  setup:      'What is the real challenge you face right now? And what would a genuinely successful outcome look like in 5–10 years?',
  planning:   'If you had full control, what are the most important moves to make? Challenge each other — is every step really necessary?',
  curveball:  'What could go wrong? What disruptions or shocks could completely derail this plan?',
  ripple:     'If all this happened, what would change across the wider system? Who else would be affected, and how?',
  reflection: 'What surprised you most? What would you do differently — and what single action should happen first?',
};

const LINKABLE_TYPES = {
  curveball: ['action'],
  ripple: ['beginning', 'action', 'end', 'curveball'],
};
const RESPONSE_LINK_TYPES = ['beginning', 'action', 'curveball', 'end'];

function normalisePhaseNotes(input = {}) {
  return Object.fromEntries(PHASES.map((phase) => [phase.id, input[phase.id] || '']));
}

function truncate(text, limit = 28) {
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
}

function createParticipant(name, role = 'player') {
  return {
    id: generateCardId(),
    name: name || 'Participant',
    role,
  };
}

function normaliseParticipants(input = [], playerName = 'Planner') {
  if (input.length > 0) {
    return input.map((participant, index) => ({
      id: participant.id || generateCardId(),
      name: participant.name || `Participant ${index + 1}`,
      role: participant.role === 'facilitator'
        ? 'host'
        : (participant.role || (index === 0 ? 'host' : 'player')),
    }));
  }

  return [
    createParticipant(playerName || 'Planner', 'host'),
    createParticipant('Player 2'),
    createParticipant('Player 3'),
  ];
}

export function initGame(roomCode, options = {}) {
  const { initialState = null, onStateChange = () => {}, playerName = 'Planner' } = options;

  const viewport = document.getElementById('board-viewport');
  const surface = document.getElementById('board-surface');
  const panelCards = document.getElementById('panel-card-list');
  const zoomIn = document.getElementById('zoom-in');
  const zoomOut = document.getElementById('zoom-out');
  const zoomReset = document.getElementById('zoom-reset');
  const zoomLevel = document.getElementById('zoom-level');
  const phaseLabel = document.getElementById('phase-label');
  const nextPhaseBtn = document.getElementById('next-phase-btn');
  const prevPhaseBtn = document.getElementById('prev-phase-btn');
  const panelToggle = document.getElementById('panel-toggle');
  const cardPanel = document.getElementById('card-panel');
  const panelStoryView = document.getElementById('panel-story-view');
  const panelTabs = document.getElementById('panel-tabs');
  const panelDeckContext = document.getElementById('panel-deck-context');
  const panelTitle = document.getElementById('panel-title');
  const panelCopy = document.getElementById('panel-copy');
  const panelPhaseStatus = document.getElementById('panel-phase-status');
  const emptyPrompt = document.getElementById('board-empty-prompt');
  const panelCardCount = document.getElementById('panel-card-count');
  const panelFooterCopy = document.querySelector('.panel-footer-copy');
  const cardEditorContent = document.getElementById('card-editor-content');
  const panelInspectorView = document.getElementById('panel-inspector-view');
  const panelInspectorBackBtn = document.getElementById('panel-inspector-back-btn');
  const panelInspectorCrumb = document.getElementById('panel-inspector-crumb');
  const participantRail = document.getElementById('participant-rail');
  const addParticipantBtn = document.getElementById('add-participant-btn');
  const playerAvatar = document.getElementById('player-avatar');
  const panelFaciPrompt = document.getElementById('panel-faci-prompt');
  const panelFaciText = document.getElementById('panel-faci-text');

  let selectedCardId = null;
  let panelMode = 'cards';
  let prevPanelMode = 'cards'; // restored when inspector closes
  let activePanelType = initialState?.lastPanelType || 'action';
  let hasFittedView = false;
  let isConnectMode = false;
  let connectionSourceId = null;
  let isInitializing = true; // suppresses phase announcement on first load

  const participants = normaliseParticipants(initialState?.participants, playerName);
  const initialActiveParticipantId = initialState?.activeParticipantId && participants.some((participant) => participant.id === initialState.activeParticipantId)
    ? initialState.activeParticipantId
    : participants[0]?.id || null;

  const gameState = {
    roomCode,
    cards: initialState?.cards ? cloneCards(initialState.cards) : {},
    connections: initialState?.connections || [],
    manualConnections: initialState?.manualConnections ? [...initialState.manualConnections] : [],
    phase: initialState?.phase || 'setup',
    phaseNotes: normalisePhaseNotes(initialState?.phaseNotes),
    participants,
    activeParticipantId: initialActiveParticipantId,
  };

  const board = createBoard(viewport, surface);
  const timeline = createTimeline(surface);
  const drag = createDragSystem(board, surface, {
    placeCard,
    moveCard,
    quickPlaceCard,
  }, {
    createBoardCard,
  });
  const phases = createPhaseManager(onPhaseChange);

  zoomIn?.addEventListener('click', () => {
    board.zoomIn();
    updateZoomDisplay();
  });
  zoomOut?.addEventListener('click', () => {
    board.zoomOut();
    updateZoomDisplay();
  });
  zoomReset?.addEventListener('click', () => {
    board.resetView();
    updateZoomDisplay();
  });
  board.onChange(() => updateZoomDisplay());

  panelToggle?.addEventListener('click', () => {
    cardPanel?.classList.toggle('collapsed');
    const isCollapsed = cardPanel?.classList.contains('collapsed');
    panelToggle.textContent = isCollapsed ? '◀' : '▶';
  });

  document.querySelectorAll('.panel-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.disabled) return;
      activePanelType = tab.dataset.type || 'action';
      populatePanel(activePanelType);
    });
  });

  document.querySelectorAll('.panel-mode-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const newMode = tab.dataset.panelMode || 'cards';
      // If inspector is open, close it cleanly first
      if (panelMode === 'inspect') {
        selectedCardId = null;
        document.querySelectorAll('.board-card').forEach((el) => el.classList.remove('is-selected'));
      }
      prevPanelMode = newMode;
      panelMode = newMode;
      document.querySelectorAll('.panel-mode-tab').forEach((candidate) => {
        candidate.classList.toggle('active', candidate === tab);
      });
      syncPanelMode();
    });
  });

  viewport?.addEventListener('click', (event) => {
    if (event.target === viewport || event.target === surface) {
      if (isConnectMode) {
        exitConnectMode();
      } else {
        setSelectedCard(null);
      }
    }
  });

  addParticipantBtn?.addEventListener('click', () => {
    const name = prompt('Add participant name:');
    if (!name?.trim()) return;

    const participant = createParticipant(name.trim());
    gameState.participants.push(participant);
    setActiveParticipant(participant.id);
    emitStateChange();
  });

  panelInspectorBackBtn?.addEventListener('click', closeCardEditor);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (isConnectMode) {
        exitConnectMode();
      } else {
        closeCardEditor();
      }
    }
  });

  document.getElementById('connect-mode-btn')?.addEventListener('click', toggleConnectMode);
  document.getElementById('tidy-board-btn')?.addEventListener('click', tidyBoard);

  nextPhaseBtn?.addEventListener('click', () => {
    if (phases.nextPhase()) {
      // Show announcement ONLY on explicit user action — not during load/restore
      showPhaseAnnouncement(phases.getCurrentPhase(), phases.getPhaseIndex());
    }
  });
  prevPhaseBtn?.addEventListener('click', () => phases.prevPhase());

  function updateZoomDisplay() {
    if (zoomLevel) {
      zoomLevel.textContent = `${Math.round(board.getScale() * 100)}%`;
    }
  }

  function getParticipantById(participantId) {
    return gameState.participants.find((participant) => participant.id === participantId) || null;
  }

  function getActiveParticipant() {
    return getParticipantById(gameState.activeParticipantId) || gameState.participants[0] || null;
  }

  function setActiveParticipant(participantId) {
    if (!getParticipantById(participantId)) return;

    gameState.activeParticipantId = participantId;
    renderParticipants();
    renderCardEditor();
  }

  function renderParticipants() {
    const activeParticipant = getActiveParticipant();

    if (playerAvatar && activeParticipant) {
      const initials = activeParticipant.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase();
      playerAvatar.textContent = initials || 'P';
      playerAvatar.setAttribute('aria-label', activeParticipant.name);
      playerAvatar.dataset.role = activeParticipant.role;
    }

    if (!participantRail) return;

    while (participantRail.firstChild) {
      participantRail.removeChild(participantRail.firstChild);
    }

    gameState.participants.forEach((participant) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'participant-chip';
      chip.textContent = participant.role === 'host'
        ? `${participant.name} · Host`
        : participant.name;
      chip.classList.toggle('is-active', participant.id === gameState.activeParticipantId);
      chip.addEventListener('click', () => {
        setActiveParticipant(participant.id);
        emitStateChange();
      });
      participantRail.appendChild(chip);
    });
  }

  function getPhasePanelText(phaseId) {
    switch (phaseId) {
      case 'setup':
        return {
          status: 'Current Move',
          title: 'Frame the Future',
          copy: 'Click the blue start and end cards to define the challenge and the future you want to reach.',
        };
      case 'planning':
        return {
          status: 'Current Move',
          title: 'Build the Pathway',
          copy: 'Use action cards to shape a plausible route from today to the desired future.',
        };
      case 'curveball':
        return {
          status: 'Current Move',
          title: 'Stress Test the Pathway',
          copy: 'Play curveballs to disrupt the route, or add response actions to show how the group adapts.',
        };
      case 'ripple':
        return {
          status: 'Current Move',
          title: 'Trace the Effects',
          copy: 'Use ripple cards to show what spreads outward from decisions, disruptions, and responses.',
        };
      case 'reflection':
        return {
          status: 'Current Move',
          title: 'Capture the Takeaways',
          copy: 'Review the board, capture the story, and export a concise session summary.',
        };
      default:
        return {
          status: 'Current Move',
          title: 'Card Tray',
          copy: 'Click a card to place it, or drag it onto the table.',
        };
    }
  }

  function renderPanelHeader() {
    const phase = phases.getCurrentPhase();
    const header = getPhasePanelText(phase.id);
    const focusCard = getCurrentFocusCard();

    if (panelPhaseStatus) {
      panelPhaseStatus.textContent = header.status;
    }

    if (panelTitle) {
      panelTitle.textContent = panelMode === 'story' ? 'Notebook and Export' : header.title;
    }

    if (panelCopy) {
      panelCopy.textContent = panelMode === 'story'
        ? 'Capture the current phase insight, then review the evolving session story and export.'
        : buildPanelCopy(header.copy, focusCard);
    }

    if (panelFooterCopy) {
      panelFooterCopy.textContent = panelMode === 'story'
        ? 'Phase notes feed the story summary and the exported workshop output.'
        : 'Click any card on the board to edit it. Drag only when you want to reposition it.';
    }

    // Facilitation prompt — show in cards mode only; hide in story mode
    if (panelFaciPrompt && panelFaciText) {
      const prompt = PHASE_FACILITATION_PROMPTS[phase.id];
      if (prompt && panelMode === 'cards') {
        panelFaciText.textContent = prompt;
        panelFaciPrompt.removeAttribute('hidden');
      } else {
        panelFaciPrompt.setAttribute('hidden', '');
      }
    }

    renderPanelTabs();
    renderDeckContext(activePanelType);
  }

  function buildPanelCopy(defaultCopy, focusCard) {
    const phaseId = phases.getCurrentPhase().id;

    if (phaseId === 'curveball' && focusCard) {
      return `Selected focus: ${focusCard.title}. Curveballs pressure that step, while action cards become response moves.`;
    }

    if (phaseId === 'ripple' && focusCard) {
      return `Selected focus: ${focusCard.title}. Use ripples to show knock-on effects, or add response actions to adapt the pathway.`;
    }

    return defaultCopy;
  }

  function renderPanelTabs() {
    const phaseId = phases.getCurrentPhase().id;
    const focusCard = getCurrentFocusCard();

    document.querySelectorAll('.panel-tab').forEach((tab) => {
      const titleEl = tab.querySelector('.panel-tab-title');
      const copyEl = tab.querySelector('.panel-tab-copy');

      if (!titleEl || !copyEl) return;

      if (tab.dataset.type === 'action') {
        titleEl.textContent = phaseId === 'planning' ? 'Action' : 'Response';
        copyEl.textContent = phaseId === 'planning'
          ? 'Build the main pathway'
          : `Adapt the path${focusCard ? ` around ${truncate(focusCard.title, 22)}` : ''}`;
      }

      if (tab.dataset.type === 'curveball') {
        titleEl.textContent = 'Curveball';
        copyEl.textContent = focusCard
          ? `Pressure ${truncate(focusCard.title, 22)}`
          : 'Pressure a pathway step';
      }

      if (tab.dataset.type === 'ripple') {
        titleEl.textContent = 'Ripple';
        copyEl.textContent = focusCard
          ? `Trace what spreads from ${truncate(focusCard.title, 20)}`
          : 'Trace knock-on effects';
      }
    });
  }

  function getRecommendedPanelType(phaseId) {
    if (phaseId === 'curveball') return 'curveball';
    if (phaseId === 'ripple') return 'ripple';
    return 'action';
  }

  function getCurrentFocusCard() {
    if (selectedCardId && gameState.cards[selectedCardId]) {
      return gameState.cards[selectedCardId];
    }

    const phaseId = phases.getCurrentPhase().id;

    if (phaseId === 'curveball' || phaseId === 'ripple') {
      return Object.values(gameState.cards)
        .filter((card) => ['action', 'curveball', 'end'].includes(card.type))
        .sort((a, b) => b.position.x - a.position.x)[0] || null;
    }

    return null;
  }

  function buildDeckContext(type) {
    const phaseId = phases.getCurrentPhase().id;
    const focusCard = getCurrentFocusCard();
    const context = document.createElement('section');
    context.className = 'panel-deck-context';

    const heading = document.createElement('div');
    heading.className = 'panel-deck-context-heading';
    heading.textContent = type === 'action'
      ? (phaseId === 'planning' ? 'Pathway play' : 'Response play')
      : type === 'curveball'
        ? 'Disruption play'
        : 'Effect mapping';
    context.appendChild(heading);

    const body = document.createElement('div');
    body.className = 'panel-deck-context-body';

    if (type === 'action') {
      body.textContent = phaseId === 'planning'
        ? 'New action cards extend the main pathway.'
        : `New action cards become response moves${focusCard ? ` linked to ${focusCard.title}.` : '.'}`;
    } else if (type === 'curveball') {
      body.textContent = focusCard
        ? `New curveballs will pressure ${focusCard.title}.`
        : 'Select an action card to make the disruption target obvious.';
    } else {
      body.textContent = focusCard
        ? `New ripples will map effects spreading from ${focusCard.title}.`
        : 'Select a card to make the ripple source obvious.';
    }

    context.appendChild(body);

    if (focusCard && phaseId !== 'planning') {
      const chip = document.createElement('div');
      chip.className = `panel-focus-chip panel-focus-chip--${focusCard.type}`;
      chip.textContent = `Current focus: ${truncate(focusCard.title, 38)}`;
      context.appendChild(chip);
    }

    return context;
  }

  function renderDeckContext(type = activePanelType) {
    if (!panelDeckContext) return;

    while (panelDeckContext.firstChild) {
      panelDeckContext.removeChild(panelDeckContext.firstChild);
    }

    if (panelMode !== 'cards' || !getAllowedPanelTypes().includes(type)) return;

    panelDeckContext.appendChild(buildDeckContext(type));
  }

  function syncPanelMode() {
    const showCards = panelMode === 'cards';
    const showStory = panelMode === 'story';
    const showInspect = panelMode === 'inspect';
    const isSetup = phases.getCurrentPhase().id === 'setup';

    cardPanel?.classList.toggle('panel--story', showStory);
    cardPanel?.classList.toggle('panel--cards', showCards);
    cardPanel?.classList.toggle('panel--inspect', showInspect);
    // Modifier: hide all card-deck chrome during setup phase
    cardPanel?.classList.toggle('panel--setup', isSetup && showCards);

    panelCards?.toggleAttribute('hidden', !showCards);
    panelStoryView?.toggleAttribute('hidden', !showStory);
    panelInspectorView?.toggleAttribute('hidden', !showInspect);
    panelTabs?.toggleAttribute('hidden', !showCards);

    renderPanelHeader();

    if (showCards) {
      populatePanel(activePanelType);
    } else if (showStory) {
      renderStoryPanel();
      updatePanelCount('Live session story and export');
    } else if (showInspect) {
      renderCardEditor();
    }
  }

  function buildStorySummary() {
    const timelineCards = getTimelineCards();
    const branchActions = Object.values(gameState.cards).filter((card) => card.type === 'action' && card.lane === 'response');
    const curveballs = Object.values(gameState.cards).filter((card) => card.type === 'curveball');
    const ripples = Object.values(gameState.cards).filter((card) => card.type === 'ripple');
    const startCard = timelineCards[0];
    const endCard = timelineCards[timelineCards.length - 1];
    const signals = [
      gameState.phaseNotes.ripple,
      ...ripples.slice(0, 3).map((card) => card.title),
    ].filter(Boolean);
    const nextSteps = [
      gameState.phaseNotes.reflection,
      ...branchActions.slice(0, 3).map((card) => card.title),
    ].filter(Boolean);

    return {
      title: `${roomCode} futures session`,
      phase: phases.getCurrentPhase().label,
      scenarioStart: startCard?.title || 'Starting situation',
      scenarioEnd: endCard?.title || 'End goal',
      scenarioStartDescription: startCard?.description || '',
      scenarioEndDescription: endCard?.description || '',
      pathway: timelineCards.filter((card) => card.type === 'action'),
      branchActions,
      curveballs,
      ripples,
      signals,
      nextSteps,
      notes: PHASES
        .map((phase) => ({ label: phase.label, note: gameState.phaseNotes[phase.id] || '' }))
        .filter((item) => item.note),
      conclusion: {
        mainTension: gameState.phaseNotes.curveball || '',
        rippleInsight: gameState.phaseNotes.ripple || '',
        nextMove: gameState.phaseNotes.reflection || '',
      },
    };
  }

  function buildStoryText(summary) {
    const lines = [
      summary.title,
      '',
      `Current phase: ${summary.phase}`,
      `Start: ${summary.scenarioStart}`,
      summary.scenarioStartDescription ? `Start detail: ${summary.scenarioStartDescription}` : null,
      `End goal: ${summary.scenarioEnd}`,
      summary.scenarioEndDescription ? `End detail: ${summary.scenarioEndDescription}` : null,
      '',
      'Pathway:',
    ].filter(Boolean);

    summary.pathway.forEach((card, index) => {
      lines.push(`${index + 1}. ${card.title}${card.description ? ` - ${card.description}` : ''}`);
    });

    if (summary.branchActions.length > 0) {
      lines.push('', 'Responses and adaptations:');
      summary.branchActions.forEach((card) => {
        const source = gameState.cards[card.linkedTo]?.title || 'the pathway';
        lines.push(`- ${card.title} responds to ${source}`);
      });
    }

    if (summary.curveballs.length > 0) {
      lines.push('', 'Curveballs:');
      summary.curveballs.forEach((card) => {
        const source = gameState.cards[card.linkedTo]?.title || 'Unlinked';
        lines.push(`- ${card.title} pressures ${source}`);
      });
    }

    if (summary.ripples.length > 0) {
      lines.push('', 'Ripples:');
      summary.ripples.forEach((card) => {
        const source = gameState.cards[card.linkedTo]?.title || 'Unlinked';
        lines.push(`- ${card.title} grows from ${source}`);
      });
    }

    if (summary.notes.length > 0) {
      lines.push('', 'Phase notes:');
      summary.notes.forEach((item) => {
        lines.push(`- ${item.label}: ${item.note}`);
      });
    }

    if (summary.signals.length > 0) {
      lines.push('', 'Signals to watch:');
      summary.signals.forEach((item) => {
        lines.push(`- ${item}`);
      });
    }

    if (summary.conclusion.mainTension || summary.conclusion.rippleInsight || summary.conclusion.nextMove) {
      lines.push('', 'Conclusion:');
      if (summary.conclusion.mainTension) lines.push(`- Main tension: ${summary.conclusion.mainTension}`);
      if (summary.conclusion.rippleInsight) lines.push(`- Key ripple: ${summary.conclusion.rippleInsight}`);
      if (summary.conclusion.nextMove) lines.push(`- Next move: ${summary.conclusion.nextMove}`);
    }

    if (summary.nextSteps.length > 0) {
      lines.push('', 'Immediate next steps:');
      summary.nextSteps.forEach((item) => {
        lines.push(`- ${item}`);
      });
    }

    return lines.join('\n');
  }

  function renderStoryPanel() {
    if (!panelStoryView) return;

    while (panelStoryView.firstChild) {
      panelStoryView.removeChild(panelStoryView.firstChild);
    }

    const summary = buildStorySummary();
    const text = buildStoryText(summary);
    const currentPhase = phases.getCurrentPhase();

    const title = document.createElement('div');
    title.className = 'story-panel-title';
    title.textContent = 'Session Notebook';
    panelStoryView.appendChild(title);

    const intro = document.createElement('p');
    intro.className = 'story-panel-copy';
    intro.textContent = 'Capture one takeaway per phase — the notebook builds a live record of the session.';
    panelStoryView.appendChild(intro);

    // Past phase notes — read-only chronological history
    const currentPhaseIndex = phases.getPhaseIndex();
    const pastPhases = PHASES.slice(0, currentPhaseIndex).filter(
      (ph) => gameState.phaseNotes[ph.id]
    );

    if (pastPhases.length > 0) {
      const historySection = document.createElement('div');
      historySection.className = 'notebook-history';

      pastPhases.forEach((ph) => {
        const entry = document.createElement('div');
        entry.className = 'notebook-history-entry';

        const header = document.createElement('div');
        header.className = 'notebook-history-header';

        const tag = document.createElement('div');
        tag.className = `notebook-history-tag notebook-history-tag--${ph.id}`;
        tag.textContent = ph.label;
        header.appendChild(tag);

        const label = document.createElement('div');
        label.className = 'notebook-history-label';
        label.textContent = ph.description;
        header.appendChild(label);

        entry.appendChild(header);

        const text = document.createElement('div');
        text.className = 'notebook-history-text';
        text.textContent = gameState.phaseNotes[ph.id];
        entry.appendChild(text);

        historySection.appendChild(entry);
      });

      panelStoryView.appendChild(historySection);
    }

    const notebook = document.createElement('section');
    notebook.className = 'story-notebook';

    const notebookHeader = document.createElement('div');
    notebookHeader.className = 'story-notebook-header';

    const notebookTag = document.createElement('div');
    notebookTag.className = 'story-phase-tag';
    notebookTag.textContent = currentPhase.label;
    notebookHeader.appendChild(notebookTag);

    const notebookTitle = document.createElement('div');
    notebookTitle.className = 'story-notebook-title';
    notebookTitle.textContent = 'Current phase takeaway';
    notebookHeader.appendChild(notebookTitle);

    notebook.appendChild(notebookHeader);

    const notebookPrompt = document.createElement('div');
    notebookPrompt.className = 'panel-note-prompt';
    notebookPrompt.textContent = PHASE_NOTE_PROMPTS[currentPhase.id];
    notebook.appendChild(notebookPrompt);

    const notebookInput = document.createElement('textarea');
    notebookInput.className = 'panel-note-input';
    notebookInput.rows = 4;
    notebookInput.placeholder = 'Capture the strongest move, tension, or signal from this phase.';
    notebookInput.value = gameState.phaseNotes[currentPhase.id] || '';
    notebookInput.addEventListener('input', () => {
      gameState.phaseNotes[currentPhase.id] = notebookInput.value;
      // Only update the export-text element — NEVER call renderStoryPanel() from here.
      // renderStoryPanel() clears the entire panelStoryView DOM (including this textarea),
      // which destroys focus and breaks typing after every single keystroke.
      const preEl = panelStoryView?.querySelector('.story-panel-pre');
      if (preEl) preEl.textContent = buildStoryText(buildStorySummary());
      onStateChange(snapshotState());
    });
    notebook.appendChild(notebookInput);

    const notebookHint = document.createElement('div');
    notebookHint.className = 'story-notebook-hint';
    notebookHint.textContent = 'This note is folded into the session story and export below.';
    notebook.appendChild(notebookHint);

    panelStoryView.appendChild(notebook);

    const highlights = document.createElement('div');
    highlights.className = 'story-highlights';

    [
      { label: 'Core actions', value: String(summary.pathway.length) },
      { label: 'Response actions', value: String(summary.branchActions.length) },
      { label: 'Curveballs', value: String(summary.curveballs.length) },
      { label: 'Ripples', value: String(summary.ripples.length) },
    ].forEach((item) => {
      const stat = document.createElement('div');
      stat.className = 'story-highlight';

      const value = document.createElement('div');
      value.className = 'story-highlight-value';
      value.textContent = item.value;
      stat.appendChild(value);

      const label = document.createElement('div');
      label.className = 'story-highlight-label';
      label.textContent = item.label;
      stat.appendChild(label);

      highlights.appendChild(stat);
    });
    panelStoryView.appendChild(highlights);

    const sectionDefs = [
      {
        title: 'Workshop Brief',
        items: [
          {
            title: 'Challenge now',
            body: summary.scenarioStartDescription || summary.scenarioStart,
          },
          {
            title: 'Preferred future',
            body: summary.scenarioEndDescription || summary.scenarioEnd,
          },
          summary.conclusion.mainTension
            ? {
                title: 'Main pressure',
                body: summary.conclusion.mainTension,
              }
            : null,
          summary.conclusion.nextMove
            ? {
                title: 'Recommended next move',
                body: summary.conclusion.nextMove,
              }
            : null,
        ].filter(Boolean),
      },
      {
        title: 'Core Pathway',
        items: summary.pathway.map((card) => ({
          title: card.title,
          body: card.description || 'Pathway step',
        })),
      },
      {
        title: 'Adaptations',
        items: summary.branchActions.map((card) => ({
          title: card.title,
          body: `Responds to ${gameState.cards[card.linkedTo]?.title || 'the pathway'}`,
        })),
      },
      {
        title: 'Disruptions',
        items: summary.curveballs.map((card) => ({
          title: card.title,
          body: `Pressures ${gameState.cards[card.linkedTo]?.title || 'the pathway'}`,
        })),
      },
      {
        title: 'Ripple Effects',
        items: summary.ripples.map((card) => ({
          title: card.title,
          body: `Effect of ${gameState.cards[card.linkedTo]?.title || 'the pathway'}`,
        })),
      },
      {
        title: 'Signals to Watch',
        items: summary.signals.map((item) => ({
          title: item,
          body: 'Watch this as the future unfolds',
        })),
      },
      {
        title: 'Immediate Next Steps',
        items: summary.nextSteps.map((item) => ({
          title: item,
          body: 'Suggested follow-on move for the group',
        })),
      },
    ];

    sectionDefs.forEach((sectionDef) => {
      if (sectionDef.items.length === 0) return;

      const section = document.createElement('section');
      section.className = 'story-section';

      const heading = document.createElement('h3');
      heading.className = 'story-section-title';
      heading.textContent = sectionDef.title;
      section.appendChild(heading);

      sectionDef.items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'story-row';

        const rowTitle = document.createElement('div');
        rowTitle.className = 'story-row-title';
        rowTitle.textContent = item.title;
        row.appendChild(rowTitle);

        const rowBody = document.createElement('div');
        rowBody.className = 'story-row-body';
        rowBody.textContent = item.body;
        row.appendChild(rowBody);

        section.appendChild(row);
      });

      panelStoryView.appendChild(section);
    });

    if (summary.notes.length > 0) {
      const notesSection = document.createElement('section');
      notesSection.className = 'story-section';
      const heading = document.createElement('h3');
      heading.className = 'story-section-title';
      heading.textContent = 'Phase Notes';
      notesSection.appendChild(heading);

      summary.notes.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'story-row';
        const rowTitle = document.createElement('div');
        rowTitle.className = 'story-row-title';
        rowTitle.textContent = item.label;
        row.appendChild(rowTitle);
        const rowBody = document.createElement('div');
        rowBody.className = 'story-row-body';
        rowBody.textContent = item.note;
        row.appendChild(rowBody);
        notesSection.appendChild(row);
      });
      panelStoryView.appendChild(notesSection);
    }

    if (summary.conclusion.mainTension || summary.conclusion.rippleInsight || summary.conclusion.nextMove) {
      const conclusionSection = document.createElement('section');
      conclusionSection.className = 'story-section story-section--conclusion';
      const heading = document.createElement('h3');
      heading.className = 'story-section-title';
      heading.textContent = 'Conclusion';
      conclusionSection.appendChild(heading);

      [
        { title: 'Main tension', body: summary.conclusion.mainTension },
        { title: 'Key ripple', body: summary.conclusion.rippleInsight },
        { title: 'Next move', body: summary.conclusion.nextMove },
      ].filter((item) => item.body).forEach((item) => {
        const row = document.createElement('div');
        row.className = 'story-row';
        const rowTitle = document.createElement('div');
        rowTitle.className = 'story-row-title';
        rowTitle.textContent = item.title;
        row.appendChild(rowTitle);
        const rowBody = document.createElement('div');
        rowBody.className = 'story-row-body';
        rowBody.textContent = item.body;
        row.appendChild(rowBody);
        conclusionSection.appendChild(row);
      });

      panelStoryView.appendChild(conclusionSection);
    }

    const pre = document.createElement('pre');
    pre.className = 'story-panel-pre';
    pre.textContent = text;
    panelStoryView.appendChild(pre);

    const actions = document.createElement('div');
    actions.className = 'story-panel-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'story-panel-btn';
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy Summary';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = 'Copied';
        window.setTimeout(() => {
          copyBtn.textContent = 'Copy Summary';
        }, 1200);
      } catch {
        copyBtn.textContent = 'Copy Failed';
      }
    });
    actions.appendChild(copyBtn);

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'story-panel-btn';
    downloadBtn.type = 'button';
    downloadBtn.textContent = 'Download .txt';
    downloadBtn.addEventListener('click', () => {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${roomCode.toLowerCase()}-futures-summary.txt`;
      link.click();
      URL.revokeObjectURL(url);
    });
    actions.appendChild(downloadBtn);

    panelStoryView.appendChild(actions);
  }

  function openCardEditor(cardId) {
    if (!gameState.cards[cardId]) return;

    // Remember current mode so Back can restore it
    if (panelMode !== 'inspect') {
      prevPanelMode = panelMode;
    }

    selectedCardId = cardId;

    // Show the breadcrumb label
    if (panelInspectorCrumb) {
      const card = gameState.cards[cardId];
      panelInspectorCrumb.textContent = card ? card.title : '';
    }

    // Update board selection visuals
    document.querySelectorAll('.board-card').forEach((el) => {
      el.classList.toggle('is-selected', el.dataset.cardId === cardId);
    });

    // Switch panel to inspect mode
    panelMode = 'inspect';
    syncPanelMode();
  }

  function closeCardEditor() {
    selectedCardId = null;

    // Deselect all cards
    document.querySelectorAll('.board-card').forEach((el) => el.classList.remove('is-selected'));

    // Restore the previous panel mode
    panelMode = prevPanelMode || 'cards';
    syncPanelMode();
    renderPanelHeader();
  }

  function onPhaseChange(phase, index) {
    gameState.phase = phase.id;
    activePanelType = getAllowedPanelTypes().includes(getRecommendedPanelType(phase.id))
      ? getRecommendedPanelType(phase.id)
      : (getAllowedPanelTypes()[0] || activePanelType);
    // Close any open inspector when the phase changes
    if (panelMode === 'inspect') {
      selectedCardId = null;
      document.querySelectorAll('.board-card').forEach((el) => el.classList.remove('is-selected'));
      panelMode = prevPanelMode || 'cards';
    }

    if (phase.id === 'reflection') {
      panelMode = 'story';
      document.querySelectorAll('.panel-mode-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.panelMode === 'story');
      });
    } else if (panelMode === 'story') {
      document.querySelectorAll('.panel-mode-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.panelMode === 'cards');
      });
      panelMode = 'cards';
    }
    updatePhaseUI(phase, index);
    syncTabAvailability(phase);
    syncPanelMode();
    renderCardEditor();
    emitStateChange();
  }

  function updatePhaseUI(phase, index) {
    // Set data-phase on container for CSS phase-aware theming
    const container = document.getElementById('game-container');
    if (container) {
      container.dataset.phase = phase.id;
    }

    if (phaseLabel) {
      phaseLabel.textContent = `${phase.label}: ${phase.description}`;
    }

    document.querySelectorAll('.phase-pip').forEach((pip, pipIndex) => {
      pip.classList.toggle('active', pipIndex === index);
      pip.classList.toggle('completed', pipIndex < index);
    });

    if (prevPhaseBtn) {
      prevPhaseBtn.style.display = index > 0 ? '' : 'none';
    }

    if (nextPhaseBtn) {
      if (index >= PHASES.length - 1) {
        nextPhaseBtn.textContent = 'Game Complete';
        nextPhaseBtn.disabled = true;
        nextPhaseBtn.classList.remove('is-pulsing');
      } else {
        nextPhaseBtn.textContent = `Next: ${PHASES[index + 1].label} →`;
        nextPhaseBtn.disabled = false;
        // Pulse the button only during Setup so players know it's the key action
        nextPhaseBtn.classList.toggle('is-pulsing', index === 0);
      }
    }
    // Hide board tools that are irrelevant during setup (no removable cards yet).
    const isSetup = phase.id === 'setup';
    document.getElementById('tidy-board-btn')?.classList.toggle('topbar-btn--hidden', isSetup);
    document.getElementById('connect-mode-btn')?.classList.toggle('topbar-btn--hidden', isSetup);

    // NOTE: showPhaseAnnouncement is intentionally NOT called here.
    // It is called explicitly from the Next Phase button click handler
    // (and from the setup guide CTA) to avoid firing during state restoration.
  }

  function showPhaseAnnouncement(phase, index) {
    // Don't interrupt the user with an overlay during the initial page load
    if (isInitializing) return;

    const overlay = document.getElementById('phase-announcement');
    if (!overlay) return;

    // Per-phase colour palettes for the announcement card
    const ANNOUNCE_PALETTES = {
      setup:      { color: '#3B82F6', bg: 'rgba(59,130,246,0.06)',  border: 'rgba(59,130,246,0.2)'  },
      planning:   { color: '#E5A100', bg: 'rgba(229,161,0,0.06)',   border: 'rgba(229,161,0,0.22)'  },
      curveball:  { color: '#DC2626', bg: 'rgba(220,38,38,0.06)',   border: 'rgba(220,38,38,0.2)'   },
      ripple:     { color: '#059669', bg: 'rgba(5,150,105,0.06)',   border: 'rgba(5,150,105,0.2)'   },
      reflection: { color: '#1E40AF', bg: 'rgba(30,64,175,0.06)',  border: 'rgba(30,64,175,0.2)'   },
    };
    const palette = ANNOUNCE_PALETTES[phase.id] || ANNOUNCE_PALETTES.setup;

    // Rebuild card content
    while (overlay.firstChild) overlay.removeChild(overlay.firstChild);

    const card = document.createElement('div');
    card.className = 'phase-announcement-card';
    card.style.setProperty('--announce-color',  palette.color);
    card.style.setProperty('--announce-bg',     palette.bg);
    card.style.setProperty('--announce-border', palette.border);

    const eyebrow = document.createElement('div');
    eyebrow.className = 'phase-announcement-eyebrow';
    eyebrow.textContent = `Phase ${index + 1} of ${PHASES.length}`;
    card.appendChild(eyebrow);

    const title = document.createElement('div');
    title.className = 'phase-announcement-title';
    title.textContent = phase.label;
    card.appendChild(title);

    const desc = document.createElement('div');
    desc.className = 'phase-announcement-desc';
    desc.textContent = phase.description;
    card.appendChild(desc);

    const promptBox = document.createElement('div');
    promptBox.className = 'phase-announcement-prompt';

    const promptLabel = document.createElement('div');
    promptLabel.className = 'phase-announcement-prompt-label';
    promptLabel.textContent = '🎯 Facilitator — ask the group';
    promptBox.appendChild(promptLabel);

    const promptText = document.createElement('div');
    promptText.className = 'phase-announcement-prompt-text';
    promptText.textContent = PHASE_FACILITATION_PROMPTS[phase.id] || phase.description;
    promptBox.appendChild(promptText);
    card.appendChild(promptBox);

    const footer = document.createElement('div');
    footer.className = 'phase-announcement-footer';

    const hint = document.createElement('div');
    hint.className = 'phase-announcement-hint';
    hint.textContent = 'Discuss the prompt, then start placing cards.';
    footer.appendChild(hint);

    const goBtn = document.createElement('button');
    goBtn.className = 'phase-announcement-go';
    goBtn.type = 'button';
    goBtn.textContent = "Let's go →";
    goBtn.addEventListener('click', () => overlay.setAttribute('hidden', ''));
    footer.appendChild(goBtn);

    card.appendChild(footer);
    overlay.appendChild(card);
    overlay.removeAttribute('hidden');
  }

  function populatePanel(filterType) {
    if (!panelCards) return;

    const allowedPanelTypes = getAllowedPanelTypes();
    let type = filterType;

    if (allowedPanelTypes.length === 0) {
      clearPanelCards();
      const phaseId = phases.getCurrentPhase().id;

      if (phaseId === 'setup') {
        // Setup guide: facilitation prompt + numbered steps + CTA
        const guide = document.createElement('div');
        guide.className = 'panel-setup-guide';

        // "Ask the group" facilitation callout
        const ask = document.createElement('div');
        ask.className = 'panel-setup-ask';
        const askLabel = document.createElement('div');
        askLabel.className = 'panel-setup-ask-label';
        askLabel.textContent = 'Ask the group';
        const askText = document.createElement('div');
        askText.className = 'panel-setup-ask-text';
        askText.textContent = PHASE_FACILITATION_PROMPTS.setup;
        ask.appendChild(askLabel);
        ask.appendChild(askText);
        guide.appendChild(ask);

        // Numbered steps
        const steps = document.createElement('div');
        steps.className = 'panel-setup-steps';

        [
          'Click the blue START card on the board and describe the challenge you face right now.',
          'Click the blue END card and describe the future you want to reach in 5–10 years.',
          'When the group agrees on the framing, advance to begin building your pathway.',
        ].forEach((text, i) => {
          const step = document.createElement('div');
          step.className = 'panel-setup-step';

          const num = document.createElement('div');
          num.className = 'panel-setup-step-num';
          num.textContent = String(i + 1);
          step.appendChild(num);

          const stepText = document.createElement('div');
          stepText.className = 'panel-setup-step-text';
          stepText.textContent = text;
          step.appendChild(stepText);

          steps.appendChild(step);
        });
        guide.appendChild(steps);

        // Spacer pushes button to bottom
        const spacer = document.createElement('div');
        spacer.className = 'panel-setup-spacer';
        guide.appendChild(spacer);

        const nextBtn = document.createElement('button');
        nextBtn.className = 'panel-setup-next';
        nextBtn.type = 'button';
        nextBtn.textContent = 'Start Planning →';
        nextBtn.addEventListener('click', () => {
          if (phases.nextPhase()) {
            showPhaseAnnouncement(phases.getCurrentPhase(), phases.getPhaseIndex());
          }
        });
        guide.appendChild(nextBtn);

        panelCards.appendChild(guide);
        updatePanelCount('Edit the anchor cards, then advance when ready');
      } else {
        // Reflection or other locked phase
        const emptyState = document.createElement('div');
        emptyState.className = 'panel-empty-state';
        emptyState.textContent = 'Reflection is for review. Use the Notebook tab to capture conclusions and export the session.';
        panelCards.appendChild(emptyState);
        updatePanelCount('Review mode — use the notebook.');
      }
      return;
    }

    if (!type || !allowedPanelTypes.includes(type)) {
      [type] = allowedPanelTypes;
    }

    activePanelType = type;

    document.querySelectorAll('.panel-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.type === type);
    });

    renderDeckContext(type);

    clearPanelCards();

    const cards = CARD_LIBRARY[type] || ACTION_CARDS;
    const phaseId = phases.getCurrentPhase().id;
    const activeParticipant = getActiveParticipant();

    // ---- Actions bar (Random Draw + Create Custom) — always at the TOP ----
    const actionsBar = document.createElement('div');
    actionsBar.className = 'panel-actions-bar';

    // "Draw random" — only shown when actively in the matching phase
    if (phaseId === type && ['curveball', 'ripple'].includes(type)) {
      const dealBtn = document.createElement('button');
      dealBtn.className = 'panel-action-btn';
      dealBtn.type = 'button';
      const dealIcon = type === 'curveball' ? '🎲' : '🌱';
      dealBtn.disabled = activeParticipant?.role !== 'host';
      dealBtn.textContent = dealBtn.disabled ? 'Host only' : `${dealIcon} Random`;
      dealBtn.title = dealBtn.disabled
        ? 'Only the session host can draw random cards'
        : `Deal a random ${type} card onto the board`;
      dealBtn.addEventListener('click', () => {
        const randomCard = cards[Math.floor(Math.random() * cards.length)];
        const placedCardId = quickPlaceCard(randomCard);
        if (placedCardId) setSelectedCard(placedCardId);
      });
      actionsBar.appendChild(dealBtn);
    }

    // "Create custom" — always shown
    const createBtn = document.createElement('button');
    createBtn.className = 'panel-action-btn';
    createBtn.type = 'button';
    createBtn.textContent = '+ Custom';
    createBtn.title = `Create a custom ${type} card`;
    createBtn.addEventListener('click', () => {
      const title = prompt('Card title:');
      if (!title) return;
      const description = prompt('Description (optional):') || '';
      const customCard = {
        type,
        title,
        description,
        id: generateCardId(),
        isCustom: true,
      };
      const panelCard = createPanelCard(customCard);
      panelCard.addEventListener('pointerdown', (event) => {
        drag.startPanelDrag(event, panelCard, customCard);
      });
      // Insert new custom card right after the actions bar (before library cards)
      panelCards.insertBefore(panelCard, actionsBar.nextSibling);
    });
    actionsBar.appendChild(createBtn);

    panelCards.appendChild(actionsBar);

    // ---- Library cards ----
    cards.forEach((cardData) => {
      const panelCard = createPanelCard(cardData);
      panelCard.addEventListener('pointerdown', (event) => {
        drag.startPanelDrag(event, panelCard, cardData);
      });
      panelCards.appendChild(panelCard);
    });

    updatePanelCount(`${cards.length} ${type} cards available`);
  }

  function placeCard(cardData, x, y, options = {}) {
    const { bypassPhaseRules = false, silent = false } = options;
    const type = cardData.type;

    if (!bypassPhaseRules && !phases.canPlaceCardType(type)) {
      return null;
    }

    const cardId = generateCardId();
    const activeParticipant = getActiveParticipant();
    const cardState = {
      cardId,
      type,
      title: cardData.title,
      description: cardData.description || '',
      note: cardData.note || '',
      linkedTo: cardData.linkedTo || null,
      libraryId: cardData.id || null,
      isCustom: cardData.isCustom || false,
      isEditable: cardData.isEditable !== false,
      ownerId: cardData.ownerId || activeParticipant?.id || null,
      updatedBy: cardData.updatedBy || activeParticipant?.id || null,
      lane: cardData.lane || ((type === 'action' && phases.getCurrentPhase().id !== 'planning') ? 'response' : 'timeline'),
      position: { x, y },
    };

    if (cardState.type === 'action' && cardState.lane === 'response' && !cardState.linkedTo) {
      cardState.linkedTo = getResponseAnchor(cardState.position, cardId)?.cardId || null;
    }

    if (isLinkedCard(type) && !cardState.linkedTo) {
      cardState.linkedTo = findNearestLinkTarget(type, cardState.position, cardId)?.cardId || null;
    }

    gameState.cards[cardId] = cardState;
    renderCard(cardState);
    relayoutBoard(true); // preserve drop position — no forced grid snap
    updateEmptyPrompt();
    if (!silent) {
      setSelectedCard(cardId);
    }

    if (!silent) {
      emitStateChange();
    }

    return cardId;
  }

  function moveCard(cardId, x, y) {
    const cardState = gameState.cards[cardId];
    if (!cardState || !phases.canMoveCards()) return;

    cardState.position = { x, y };
    cardState.updatedBy = getActiveParticipant()?.id || cardState.updatedBy;

    if (cardState.type === 'action' && cardState.lane === 'response') {
      cardState.linkedTo = getResponseAnchor(cardState.position, cardId)?.cardId || cardState.linkedTo;
    }

    if (isLinkedCard(cardState.type)) {
      cardState.linkedTo = findNearestLinkTarget(cardState.type, cardState.position, cardId)?.cardId || null;
    }

    relayoutBoard(true); // preserve the user's dragged position
    emitStateChange();
  }

  function quickPlaceCard(cardData) {
    const type = cardData.type;
    const timelineCards = getTimelineCards();
    let placedId = null;

    if (type === 'action') {
      if (phases.getCurrentPhase().id !== 'planning') {
        const linkedCard = getResponseAnchor();
        if (linkedCard) {
          const nextPos = getBranchActionPosition(linkedCard);
          placedId = placeCard({ ...cardData, lane: 'response', linkedTo: linkedCard.cardId }, nextPos.x, nextPos.y);
        }
      }

      if (!placedId) {
        const nextPos = timeline.getNextFreePosition(timelineCards);
        placedId = placeCard({ ...cardData, lane: 'timeline' }, nextPos.x, nextPos.y);
      }
    } else {
      const linkedCard = getDefaultAnchorFor(type);
      if (!linkedCard) {
        placedId = placeCard(cardData, timeline.TIMELINE_START_X + timeline.CARD_WIDTH * 2, timeline.TIMELINE_Y - timeline.CARD_HEIGHT - 60);
      } else {
        const nextPos = getAttachmentPosition(type, linkedCard);
        placedId = placeCard({ ...cardData, linkedTo: linkedCard.cardId }, nextPos.x, nextPos.y);
      }
    }

    // Pan to show the newly placed card if it landed off-screen
    if (placedId) {
      const card = gameState.cards[placedId];
      if (card) {
        const cx = card.position.x + timeline.CARD_WIDTH / 2;
        const cy = card.position.y + timeline.CARD_HEIGHT / 2;
        board.panTo(cx, cy, { rightInset: 580, margin: 100 });
      }
    }

    return placedId;
  }

  function removeCard(cardId) {
    const cardState = gameState.cards[cardId];
    if (!cardState || !isRemovableCard(cardState)) return;

    delete gameState.cards[cardId];
    const cardEl = surface.querySelector(`[data-card-id="${cardId}"]`);
    if (cardEl) {
      cardEl.remove();
    }

    Object.values(gameState.cards).forEach((candidate) => {
      if (candidate.linkedTo === cardId) {
        candidate.linkedTo = findNearestLinkTarget(candidate.type, candidate.position, candidate.cardId)?.cardId || null;
        renderCard(candidate);
      }
    });

    if (selectedCardId === cardId) {
      selectedCardId = null;
    }

    relayoutBoard(true); // preserve other card positions when one is removed
    updateEmptyPrompt();
    renderCardEditor();
    emitStateChange();
  }

  function updateConnections() {
    const cards = Object.values(gameState.cards);
    gameState.connections = cards
      .filter((card) => card.linkedTo)
      .map((card) => ({ from: card.linkedTo, to: card.cardId, type: card.type }));
    timeline.drawConnections(cards, gameState.manualConnections);
  }

  function updateEmptyPrompt() {
    if (!emptyPrompt) return;
    emptyPrompt.style.display = Object.keys(gameState.cards).length > 0 ? 'none' : '';
  }

  function cloneCards(cards) {
    return Object.fromEntries(
      Object.entries(cards).map(([cardId, card]) => [
        cardId,
        {
          ...card,
          note: card.note || '',
          linkedTo: card.linkedTo || null,
          isEditable: card.isEditable !== false,
          ownerId: card.ownerId || null,
          updatedBy: card.updatedBy || null,
          lane: card.lane || 'timeline',
          position: card.position ? { ...card.position } : { x: 0, y: 0 },
        },
      ])
    );
  }

  function clearPanelCards() {
    while (panelCards?.firstChild) {
      panelCards.removeChild(panelCards.firstChild);
    }
  }

  function updatePanelCount(text) {
    if (panelCardCount) {
      panelCardCount.textContent = text;
    }
  }

  function getAllowedPanelTypes() {
    return phases.getCurrentPhase().allowedCardTypes.filter((type) => PANEL_TYPES.includes(type));
  }

  function syncTabAvailability(phase) {
    const allowedPanelTypes = phase.allowedCardTypes.filter((type) => PANEL_TYPES.includes(type));

    document.querySelectorAll('.panel-tab').forEach((tab) => {
      const isEnabled = allowedPanelTypes.includes(tab.dataset.type);
      tab.disabled = !isEnabled;
      tab.setAttribute('aria-disabled', String(!isEnabled));
      tab.classList.toggle('is-disabled', !isEnabled);
      if (!isEnabled) {
        tab.classList.remove('active');
      }
    });
  }

  function findScenarioCard(type) {
    return Object.values(gameState.cards).find((card) => card.type === type) || null;
  }

  function getTimelineCards() {
    const cards = Object.values(gameState.cards);
    const beginning = cards.filter((card) => card.type === 'beginning').sort((a, b) => a.position.x - b.position.x);
    const actions = cards
      .filter((card) => card.type === 'action' && card.lane !== 'response')
      .sort((a, b) => a.position.x - b.position.x);
    const end = cards.filter((card) => card.type === 'end').sort((a, b) => a.position.x - b.position.x);
    return [...beginning, ...actions, ...end];
  }

  function getDefaultAnchorFor(type) {
    const cards = Object.values(gameState.cards);

    if (type === 'curveball') {
      return cards
        .filter((card) => card.type === 'action')
        .sort((a, b) => b.position.x - a.position.x)[0] || null;
    }

    if (type === 'ripple') {
      return cards
        .filter((card) => ['action', 'curveball', 'end'].includes(card.type))
        .sort((a, b) => b.position.x - a.position.x)[0] || null;
    }

    return null;
  }

  function getResponseAnchor(position = null, excludedCardId = null) {
    if (selectedCardId && gameState.cards[selectedCardId] && selectedCardId !== excludedCardId) {
      return gameState.cards[selectedCardId];
    }

    const candidates = Object.values(gameState.cards)
      .filter((card) => card.cardId !== excludedCardId && RESPONSE_LINK_TYPES.includes(card.type));

    if (!position) {
      return candidates.sort((a, b) => b.position.x - a.position.x)[0] || null;
    }

    return candidates.sort((a, b) => {
      const centerA = getCardCenter(a);
      const centerB = getCardCenter(b);
      const target = getCardCenter(position);
      return Math.hypot(centerA.x - target.x, centerA.y - target.y)
        - Math.hypot(centerB.x - target.x, centerB.y - target.y);
    })[0] || null;
  }

  function getBranchActionPosition(linkedCard) {
    const siblings = Object.values(gameState.cards)
      .filter((card) => card.type === 'action' && card.lane === 'response' && card.linkedTo === linkedCard.cardId)
      .sort((a, b) => a.position.y - b.position.y);

    const row = siblings.length;
    const direction = linkedCard.position.y <= timeline.TIMELINE_Y - timeline.CARD_HEIGHT / 2 ? 1 : -1;
    return {
      x: linkedCard.position.x + 240,
      y: linkedCard.position.y + direction * (timeline.CARD_HEIGHT + 90 + row * 78),
    };
  }

  function relayoutTimelineCards() {
    const timelineCards = getTimelineCards();
    if (timelineCards.length === 0) return;

    const { positions } = timeline.calculateLayout(timelineCards);

    timelineCards.forEach((card) => {
      const nextPosition = positions[card.cardId];
      if (!nextPosition) return;
      card.position = { ...nextPosition };
      renderCard(card);
    });
  }

  function relayoutAttachments() {
    Object.values(gameState.cards)
      .filter((card) => isLinkedCard(card.type))
      .forEach((card) => {
        const linkedCard = card.linkedTo ? gameState.cards[card.linkedTo] : findNearestLinkTarget(card.type, card.position, card.cardId);
        if (!linkedCard) return;

        card.linkedTo = linkedCard.cardId;
        renderCard(card);
      });
  }

  function relayoutBoard(skipTimelineLayout = false) {
    // skipTimelineLayout = true preserves the user's free card positions.
    // Only pass false (or omit) for the initial session setup.
    if (!skipTimelineLayout) relayoutTimelineCards();
    relayoutAttachments();
    updateConnections();
    renderCardEditor();
  }

  function fitBoardToSession() {
    const cards = Object.values(gameState.cards).map((card) => ({
      x: card.position.x,
      y: card.position.y,
    }));

    if (cards.length === 0) return;

    board.fitToContent(cards, {
      leftInset: 110,
      rightInset: 580,   // updated for wider panel (560px + padding)
      topInset: 110,
      bottomInset: 110,
      // Don't zoom below 65% — with only 2 spread-apart anchor cards in
      // setup, the fit would otherwise produce a distracting ~30% zoom.
      minScale: 0.65,
    });
  }

  function isLinkedCard(type) {
    return Boolean(LINKABLE_TYPES[type]);
  }

  function isRemovableCard(card) {
    return !['beginning', 'end'].includes(card.type);
  }

  function getCardCenter(cardOrPosition) {
    const position = cardOrPosition.position || cardOrPosition;
    return {
      x: position.x + timeline.CARD_WIDTH / 2,
      y: position.y + timeline.CARD_HEIGHT / 2,
    };
  }

  function findNearestLinkTarget(type, position, excludedCardId) {
    const targetCenter = getCardCenter(position);

    return getEligibleLinkTargets(type, excludedCardId)
      .sort((a, b) => {
        const centerA = getCardCenter(a);
        const centerB = getCardCenter(b);
        const distanceA = Math.hypot(centerA.x - targetCenter.x, centerA.y - targetCenter.y);
        const distanceB = Math.hypot(centerB.x - targetCenter.x, centerB.y - targetCenter.y);
        return distanceA - distanceB;
      })[0] || null;
  }

  function getEligibleLinkTargets(type, excludedCardId) {
    const eligibleTypes = LINKABLE_TYPES[type];
    if (!eligibleTypes) return [];

    return Object.values(gameState.cards)
      .filter((card) => card.cardId !== excludedCardId && eligibleTypes.includes(card.type));
  }

  function getResponseTargets(excludedCardId) {
    return Object.values(gameState.cards)
      .filter((card) => card.cardId !== excludedCardId && RESPONSE_LINK_TYPES.includes(card.type));
  }

  function getAttachmentPosition(type, linkedCard, cardId = null) {
    const siblings = Object.values(gameState.cards)
      .filter((card) => card.cardId !== cardId && card.type === type && card.linkedTo === linkedCard.cardId)
      .sort((a, b) => a.position.x - b.position.x);

    const index = siblings.length;
    const columns = 3;
    const column = (index % columns) - 1;
    const row = Math.floor(index / columns);
    const x = linkedCard.position.x + column * 120;
    const y = type === 'curveball'
      ? linkedCard.position.y + timeline.CARD_HEIGHT + 70 + row * 86
      : linkedCard.position.y - timeline.CARD_HEIGHT - 80 - row * 86;

    return { x, y };
  }

  function getLinkBadgeText(cardState) {
    if (!cardState.linkedTo) return '';
    const linkedCard = gameState.cards[cardState.linkedTo];
    if (!linkedCard) return '';

    if (cardState.type === 'action' && cardState.lane === 'response') {
      return `Responds to: ${truncate(linkedCard.title)}`;
    }

    const prefix = cardState.type === 'curveball' ? 'Pressures' : 'Effect of';
    return `${prefix}: ${truncate(linkedCard.title)}`;
  }

  function renderCard(cardState) {
    let cardEl = surface.querySelector(`[data-card-id="${cardState.cardId}"]`);

    if (!cardEl) {
      cardEl = createBoardCard(cardState);
      cardEl.style.position = 'absolute';
      cardEl.dataset.cardId = cardState.cardId;
      cardEl.addEventListener('pointerdown', (event) => {
        // Don't start board drag in connect mode — clicks must register cleanly
        if (!drag.isActive() && phases.canMoveCards() && !isConnectMode) {
          drag.startBoardDrag(event, cardEl);
        }
      });
      cardEl.addEventListener('click', (event) => {
        if (isConnectMode) {
          handleConnectClick(cardState.cardId);
          return;
        }
        if (!drag.shouldSuppressClick()) {
          openCardEditor(cardState.cardId);
        } else {
          setSelectedCard(cardState.cardId);
        }
      });
      surface.appendChild(cardEl);

      // Wire the in-card link button
      const linkBtn = cardEl.querySelector('.card-link-btn');
      if (linkBtn) {
        // CRITICAL: stop pointerdown before it reaches the card's handler,
        // otherwise setPointerCapture on the card hijacks the subsequent click.
        linkBtn.addEventListener('pointerdown', (event) => {
          event.stopPropagation();
        });
        linkBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          if (!isConnectMode) enterConnectMode();
          handleConnectClick(cardState.cardId);
        });
      }
    }

    cardEl.style.left = `${cardState.position.x}px`;
    cardEl.style.top = `${cardState.position.y}px`;
    cardEl.classList.toggle('is-selected', selectedCardId === cardState.cardId);
    cardEl.dataset.linkedTo = cardState.linkedTo || '';
    cardEl.dataset.cardLane = cardState.lane || '';

    const titleEl = cardEl.querySelector('.card-title');
    if (titleEl) {
      titleEl.textContent = cardState.title;
    }

    const cardBody = cardEl.querySelector('.card-body');
    let descEl = cardEl.querySelector('.card-desc');

    if (cardState.description || cardState.isEditable) {
      if (!descEl && cardBody) {
        descEl = document.createElement('div');
        descEl.className = 'card-desc';
        cardBody.insertBefore(descEl, cardEl.querySelector('.card-link-badge'));
      }

      if (descEl) {
        descEl.textContent = cardState.description;
      }
    } else if (descEl) {
      descEl.remove();
    }
    const linkBadge = cardEl.querySelector('.card-link-badge');
    if (linkBadge) {
      const linkText = getLinkBadgeText(cardState);
      linkBadge.textContent = linkText;
      linkBadge.hidden = !linkText;
      linkBadge.dataset.linkType = cardState.type;
    }

    const ownerBadge = cardEl.querySelector('.card-owner-badge');
    if (ownerBadge) {
      const owner = getParticipantById(cardState.ownerId);
      ownerBadge.textContent = owner ? `By ${truncate(owner.name, 22)}` : '';
      ownerBadge.hidden = !owner;
    }
  }

  function setSelectedCard(cardId) {
    selectedCardId = cardId && gameState.cards[cardId] ? cardId : null;
    document.querySelectorAll('.board-card').forEach((cardEl) => {
      cardEl.classList.toggle('is-selected', cardEl.dataset.cardId === selectedCardId);
    });
    renderPanelHeader();
    // Only rebuild card editor content if the inspector is already visible
    if (panelMode === 'inspect') renderCardEditor();
  }

  function renderCardEditor() {
    if (!cardEditorContent) return;

    while (cardEditorContent.firstChild) {
      cardEditorContent.removeChild(cardEditorContent.firstChild);
    }

    if (!selectedCardId || !gameState.cards[selectedCardId]) {
      const emptyState = document.createElement('div');
      emptyState.className = 'card-inspector-empty';
      emptyState.textContent = 'Select a card to annotate it, adjust its wording, or remove it.';
      cardEditorContent.appendChild(emptyState);
      return;
    }

    const cardState = gameState.cards[selectedCardId];
    const linkedCard = cardState.linkedTo ? gameState.cards[cardState.linkedTo] : null;
    const owner = getParticipantById(cardState.ownerId);

    const heading = document.createElement('div');
    heading.className = 'card-inspector-heading';
    heading.textContent = 'Edit Card';
    cardEditorContent.appendChild(heading);

    const title = document.createElement('div');
    title.className = 'card-inspector-title';
    title.textContent = cardState.title;
    cardEditorContent.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'card-inspector-meta';
    meta.textContent = [
      `${cardState.type} card`,
      linkedCard ? `linked to ${linkedCard.title}` : '',
      owner ? `owned by ${owner.name}` : '',
    ].filter(Boolean).join(' · ');
    cardEditorContent.appendChild(meta);

    const titleLabel = document.createElement('label');
    titleLabel.className = 'card-inspector-label';
    titleLabel.textContent = 'Title';
    cardEditorContent.appendChild(titleLabel);

    const titleInput = document.createElement('input');
    titleInput.className = 'card-title-input';
    titleInput.type = 'text';
    titleInput.value = cardState.title;
    titleInput.addEventListener('input', () => {
      gameState.cards[selectedCardId].title = titleInput.value;
      gameState.cards[selectedCardId].updatedBy = getActiveParticipant()?.id || gameState.cards[selectedCardId].updatedBy;
      renderCard(gameState.cards[selectedCardId]);
      updateConnections();
      emitStateChange();
    });
    cardEditorContent.appendChild(titleInput);

    const descriptionLabel = document.createElement('label');
    descriptionLabel.className = 'card-inspector-label';
    descriptionLabel.textContent = 'Description';
    cardEditorContent.appendChild(descriptionLabel);

    const descriptionInput = document.createElement('textarea');
    descriptionInput.className = 'card-description-input';
    descriptionInput.rows = 3;
    descriptionInput.value = cardState.description || '';
    descriptionInput.addEventListener('input', () => {
      gameState.cards[selectedCardId].description = descriptionInput.value;
      gameState.cards[selectedCardId].updatedBy = getActiveParticipant()?.id || gameState.cards[selectedCardId].updatedBy;
      renderCard(gameState.cards[selectedCardId]);
      emitStateChange();
    });
    cardEditorContent.appendChild(descriptionInput);

    if (isLinkedCard(cardState.type) || (cardState.type === 'action' && cardState.lane === 'response')) {
      const linkLabel = document.createElement('label');
      linkLabel.className = 'card-inspector-label';
      linkLabel.textContent = cardState.type === 'curveball'
        ? 'This curveball pressures'
        : (cardState.type === 'ripple' ? 'This ripple grows out of' : 'This response action addresses');
      cardEditorContent.appendChild(linkLabel);

      const linkSelect = document.createElement('select');
      linkSelect.className = 'card-owner-select';

      const targetCards = cardState.type === 'action' && cardState.lane === 'response'
        ? getResponseTargets(cardState.cardId)
        : getEligibleLinkTargets(cardState.type, cardState.cardId);

      targetCards.forEach((targetCard) => {
        const option = document.createElement('option');
        option.value = targetCard.cardId;
        option.textContent = truncate(targetCard.title, 36);
        option.selected = targetCard.cardId === cardState.linkedTo;
        linkSelect.appendChild(option);
      });

      linkSelect.addEventListener('change', () => {
        gameState.cards[selectedCardId].linkedTo = linkSelect.value;
        if (gameState.cards[selectedCardId].type === 'action' && gameState.cards[selectedCardId].lane === 'response') {
          gameState.cards[selectedCardId].position = getBranchActionPosition(gameState.cards[linkSelect.value]);
        }
        renderCard(gameState.cards[selectedCardId]);
        updateConnections();
        emitStateChange();
      });
      cardEditorContent.appendChild(linkSelect);
    }

    const ownerLabel = document.createElement('label');
    ownerLabel.className = 'card-inspector-label';
    ownerLabel.textContent = 'Owner';
    cardEditorContent.appendChild(ownerLabel);

    const ownerSelect = document.createElement('select');
    ownerSelect.className = 'card-owner-select';
    gameState.participants.forEach((participant) => {
      const option = document.createElement('option');
      option.value = participant.id;
      option.textContent = participant.role === 'host'
        ? `${participant.name} (Host)`
        : participant.name;
      option.selected = participant.id === cardState.ownerId;
      ownerSelect.appendChild(option);
    });
    ownerSelect.addEventListener('change', () => {
      gameState.cards[selectedCardId].ownerId = ownerSelect.value;
      gameState.cards[selectedCardId].updatedBy = getActiveParticipant()?.id || gameState.cards[selectedCardId].updatedBy;
      renderCard(gameState.cards[selectedCardId]);
      renderCardEditor();
      emitStateChange();
    });
    cardEditorContent.appendChild(ownerSelect);

    const prompt = document.createElement('div');
    prompt.className = 'card-inspector-prompt';
    prompt.textContent = CARD_NOTE_PROMPTS[cardState.type] || 'What should the group capture about this card?';
    cardEditorContent.appendChild(prompt);

    const noteInput = document.createElement('textarea');
    noteInput.className = 'card-note-input';
    noteInput.rows = 3;
    noteInput.placeholder = 'Capture the discussion, assumption, or response linked to this card.';
    noteInput.value = cardState.note || '';
    noteInput.addEventListener('input', () => {
      gameState.cards[selectedCardId].note = noteInput.value;
      gameState.cards[selectedCardId].updatedBy = getActiveParticipant()?.id || gameState.cards[selectedCardId].updatedBy;
      emitStateChange();
    });
    cardEditorContent.appendChild(noteInput);

    // Manual connections from / to this card
    const fromConns = gameState.manualConnections.filter((c) => c.from === selectedCardId);
    const toConns = gameState.manualConnections.filter((c) => c.to === selectedCardId);
    if (fromConns.length > 0 || toConns.length > 0) {
      const connLabel = document.createElement('div');
      connLabel.className = 'card-inspector-label';
      connLabel.textContent = 'Custom Links';
      cardEditorContent.appendChild(connLabel);

      [...fromConns.map((c) => ({ ...c, dir: 'to' })), ...toConns.map((c) => ({ ...c, dir: 'from' }))].forEach((conn) => {
        const otherId = conn.dir === 'to' ? conn.to : conn.from;
        const otherCard = gameState.cards[otherId];
        if (!otherCard) return;

        const row = document.createElement('div');
        row.className = 'card-conn-row';

        const lbl = document.createElement('span');
        lbl.className = 'card-conn-label';
        lbl.textContent = conn.dir === 'to'
          ? `→ ${truncate(otherCard.title, 30)}`
          : `← ${truncate(otherCard.title, 30)}`;
        row.appendChild(lbl);

        const removeConnBtn = document.createElement('button');
        removeConnBtn.className = 'card-conn-remove';
        removeConnBtn.type = 'button';
        removeConnBtn.textContent = '×';
        removeConnBtn.title = 'Remove this connection';
        removeConnBtn.addEventListener('click', () => {
          removeManualConnection(conn.from, conn.to);
          renderCardEditor();
        });
        row.appendChild(removeConnBtn);
        cardEditorContent.appendChild(row);
      });
    }

    // Draw Link button — lets the user start a connection directly from the inspector
    const linkRow = document.createElement('div');
    linkRow.className = 'card-inspector-link-row';

    const drawLinkBtn = document.createElement('button');
    drawLinkBtn.className = 'card-inspector-btn card-inspector-btn--link';
    drawLinkBtn.type = 'button';
    drawLinkBtn.textContent = '⤴ Draw Link from this card';
    drawLinkBtn.title = 'Enter connection mode with this card pre-selected as the source';
    drawLinkBtn.addEventListener('click', () => {
      const sourceId = selectedCardId;
      closeCardEditor(); // go back to board view first
      enterConnectMode();
      handleConnectClick(sourceId);
    });
    linkRow.appendChild(drawLinkBtn);
    cardEditorContent.appendChild(linkRow);

    const actions = document.createElement('div');
    actions.className = 'card-inspector-actions';

    if (isRemovableCard(cardState)) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'card-inspector-btn card-inspector-btn--danger';
      removeBtn.type = 'button';
      removeBtn.textContent = 'Remove Card';
      removeBtn.addEventListener('click', () => {
        removeCard(selectedCardId);
        closeCardEditor();
      });
      actions.appendChild(removeBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'card-inspector-btn card-inspector-btn--primary';
    closeBtn.type = 'button';
    closeBtn.textContent = 'Done';
    closeBtn.addEventListener('click', closeCardEditor);
    actions.appendChild(closeBtn);

    cardEditorContent.appendChild(actions);
  }

  function renderExistingCards() {
    Object.values(gameState.cards).forEach((card) => renderCard(card));
  }

  function hydrateRelationships() {
    Object.values(gameState.cards).forEach((card) => {
      if (isLinkedCard(card.type) && !card.linkedTo) {
        card.linkedTo = findNearestLinkTarget(card.type, card.position, card.cardId)?.cardId || null;
      }
    });
  }

  function snapshotState() {
    return {
      roomCode: gameState.roomCode,
      phase: gameState.phase,
      cards: cloneCards(gameState.cards),
      connections: [...gameState.connections],
      manualConnections: [...gameState.manualConnections],
      phaseNotes: { ...gameState.phaseNotes },
      participants: gameState.participants.map((participant) => ({ ...participant })),
      activeParticipantId: gameState.activeParticipantId,
      lastPanelType: activePanelType,
    };
  }

  // ================================================
  // Connect Mode — draw arbitrary card-to-card links
  // ================================================

  function toggleConnectMode() {
    if (isConnectMode) {
      exitConnectMode();
    } else {
      enterConnectMode();
    }
  }

  function enterConnectMode() {
    isConnectMode = true;
    connectionSourceId = null;
    document.getElementById('game-container')?.classList.add('connect-mode');
    const btn = document.getElementById('connect-mode-btn');
    if (btn) { btn.textContent = '✕ Cancel Link'; btn.classList.add('is-active'); }
    showConnectBanner('Click the source card for your connection');
  }

  function exitConnectMode() {
    isConnectMode = false;
    connectionSourceId = null;
    document.getElementById('game-container')?.classList.remove('connect-mode');
    document.querySelectorAll('.board-card').forEach((el) => el.classList.remove('connect-source'));
    const btn = document.getElementById('connect-mode-btn');
    if (btn) { btn.textContent = '⤴ Link Cards'; btn.classList.remove('is-active'); }
    hideConnectBanner();
  }

  function handleConnectClick(cardId) {
    if (!connectionSourceId) {
      // First click — select source
      connectionSourceId = cardId;
      document.querySelectorAll('.board-card').forEach((el) => {
        el.classList.toggle('connect-source', el.dataset.cardId === cardId);
      });
      const sourceTitle = gameState.cards[cardId]?.title || cardId;
      showConnectBanner(`From: "${truncate(sourceTitle, 32)}" — now click the target card`);
    } else if (connectionSourceId === cardId) {
      // Clicked same card — cancel source selection
      connectionSourceId = null;
      document.querySelectorAll('.board-card').forEach((el) => el.classList.remove('connect-source'));
      showConnectBanner('Click the source card for your connection');
    } else {
      // Second click — complete the connection
      addManualConnection(connectionSourceId, cardId);
      exitConnectMode();
    }
  }

  function showConnectBanner(message) {
    let banner = document.getElementById('connect-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'connect-banner';
      banner.className = 'connect-banner';
      viewport?.appendChild(banner);
    }
    banner.textContent = message;
  }

  function hideConnectBanner() {
    document.getElementById('connect-banner')?.remove();
  }

  function addManualConnection(fromId, toId) {
    if (fromId === toId) return; // no self-loops
    const exists = gameState.manualConnections.some((c) => c.from === fromId && c.to === toId);
    if (exists) return; // no duplicates
    gameState.manualConnections.push({ from: fromId, to: toId });
    updateConnections();
    emitStateChange();
  }

  function removeManualConnection(fromId, toId) {
    gameState.manualConnections = gameState.manualConnections.filter(
      (c) => !(c.from === fromId && c.to === toId)
    );
    updateConnections();
    emitStateChange();
  }

  // ================================================
  // Tidy Board — snap cards back to the standard timeline layout
  // ================================================

  function tidyBoard() {
    // Temporarily add is-tidying to all cards so CSS transitions fire on left/top
    document.querySelectorAll('.board-card').forEach((el) => el.classList.add('is-tidying'));
    relayoutBoard(false); // full layout — re-calculates all positions
    fitBoardToSession();  // re-centres the viewport
    setTimeout(() => {
      document.querySelectorAll('.board-card').forEach((el) => el.classList.remove('is-tidying'));
    }, 520);
  }

  // ================================================

  function emitStateChange() {
    if (panelMode === 'story') {
      renderStoryPanel();
    }
    onStateChange(snapshotState());
  }

  function setupBeginEndCards() {
    if (!findScenarioCard('beginning')) {
      placeCard(
        {
          type: 'beginning',
          title: 'Starting Situation',
          description: 'Define where you are now',
          id: 'BEGIN',
        },
        timeline.TIMELINE_START_X,
        timeline.TIMELINE_Y - timeline.CARD_HEIGHT / 2,
        { bypassPhaseRules: true, silent: true }
      );
    }

    if (!findScenarioCard('end')) {
      placeCard(
        {
          type: 'end',
          title: 'End Goal',
          description: 'Define where you want to be',
          id: 'END',
        },
        timeline.TIMELINE_START_X + 5 * (timeline.CARD_WIDTH + timeline.CARD_GAP),
        timeline.TIMELINE_Y - timeline.CARD_HEIGHT / 2,
        { bypassPhaseRules: true, silent: true }
      );
    }
  }

  updateZoomDisplay();
  renderParticipants();

  hydrateRelationships();

  if (Object.keys(gameState.cards).length > 0) {
    renderExistingCards();
  }

  setupBeginEndCards();

  if (gameState.phase !== 'setup') {
    phases.setPhase(gameState.phase);
  } else {
    onPhaseChange(phases.getCurrentPhase(), 0);
  }

  // skipTimelineLayout = true: preserve the manually set positions of both
  // fresh session begin/end cards and any loaded card positions from save state.
  relayoutBoard(true);
  if (!hasFittedView) {
    fitBoardToSession();
    hasFittedView = true;
  }
  updateEmptyPrompt();
  renderCardEditor();
  syncPanelMode();
  emitStateChange();

  // All initial setup is done — enable phase announcements for real transitions
  isInitializing = false;

  return {
    board,
    phases,
    placeCard,
    moveCard,
    quickPlaceCard,
    removeCard,
    getState: () => gameState,
  };
}
