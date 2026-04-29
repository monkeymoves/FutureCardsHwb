# Futures Card Game — Engineering Handover

This document is for the next engineer (or AI agent) picking up the codebase. It captures architecture, design decisions, and the non-obvious gotchas that aren't apparent from the code alone.

For product overview and getting-started, see [README.md](README.md).

---

## Status as of this handover

The app is **deployed and functional** at [hwbcards.web.app](https://hwbcards.web.app), running real workshops. It's no longer a "local prototype" — Firebase realtime sync is live, multiple users in different browsers can collaborate on the same board, and exports are PDF rather than TXT.

The product loop is end-to-end:

```
landing (/) → lobby → framing → game (synced) → reflection → PDF export
```

Recent significant changes (most recent first):

- **CSV-driven card library** — content lives in `content/cards.csv`, generated to JS at build time
- **PDF export via `window.print()`** — replaces the old TXT download; includes framing, participants, card notes, manual connections, and reflection
- **In-game framing edit** — refine question/goal mid-session without leaving the board
- **Inline curveballs** — curveballs are now timeline citizens (after their target action) rather than floating side-branches
- **Custom-card creation modal** — replaces native `prompt()` with a phase-coloured in-app dialog
- **Heartbeat made local-only** — fixed a phase-revert race where Tab B's 20s heartbeat would clobber Tab A's just-advanced phase
- **`+Player` button removed** — redundant since real participants arrive via the join-by-link URL flow
- **Sticky-by-name participant reclaim** — Alice closing and reopening her tab no longer creates a duplicate "Alice" entry; her old slot is reclaimed if it's idle (>45s stale)

---

## Architecture

### Data flow

```
User input → engine.js mutates gameState
  → emitStateChange() → onStateChange callback (game.astro)
    → localStorage backup (always)
    → if !applyingRemote: syncHandle.writeState() → debounced Firestore write

Firestore snapshot → onSnapshot listener (game.astro)
  → applyingRemote = true
  → engine.syncRemoteState(snapshot)
    → diff which fields actually changed
    → apply state, re-render only what changed
  → applyingRemote = false
```

The `applyingRemote` flag is the echo prevention — when we apply a remote change, the resulting `emitStateChange()` calls don't write back to Firestore.

### Sync model

**One Firestore document per room** at `rooms/{roomCode}`. The whole state is stored in a single `state` field (cards, phase, framing, participants, etc.). Writes are debounced 800ms. Echoes are filtered by `lastWriterSessionId`, which is a **fresh `crypto.randomUUID()` per page load** — NOT the Firebase anonymous UID, because UIDs persist across tabs in the same browser, which would make tabs treat each other as themselves.

Only `lastPanelType` is local-per-tab and stripped before writing. Everything else is shared (including participants).

### Phase-aware UI via CSS custom properties

`#game-container[data-phase="planning"]` (etc.) sets `--panel-phase-color`, `--panel-phase-glow`, `--panel-phase-light`. The phase manager updates the data-attribute, and CSS does the rest. New phase-coloured chrome can be added without JS changes — just write `var(--panel-phase-color)` in CSS.

### The five phases

`setup → planning → curveball → ripple → reflection`. Each phase declares `allowedCardTypes` in [phases.js](src/scripts/game/phases.js). Phase advances go through `phases.setPhase()` which fires `onPhaseChange` (in engine.js), which updates the panel, topbar, and pips and calls `emitStateChange()`.

---

## Important files

### Read-first

- **[src/scripts/game/engine.js](src/scripts/game/engine.js)** — the orchestrator. Most game logic lives here: phase callbacks, card placement (`quickPlaceCard`, `placeCard`, `moveCard`, `removeCard`), panel rendering, story summary, PDF export, sync handling. ~2700 lines but well-sectioned with comment banners.
- **[src/pages/game.astro](src/pages/game.astro)** — game shell. Boot logic, sync subscribe, modal HTML for custom-card and framing-edit, the print-view section that gets populated for PDF export.
- **[src/scripts/firebase/sync.js](src/scripts/firebase/sync.js)** — sync handle factory. Returns `{ initialState, writeState, subscribe, dispose }`. Tiny — readable in one sitting.

### Layout & rendering

- **[src/scripts/game/timeline.js](src/scripts/game/timeline.js)** — `calculateLayout()` for left-to-right pathway positioning, `drawConnections()` for the SVG arrow chain. Honours caller order so `getTimelineCards()` controls the sequence.
- **[src/scripts/game/board.js](src/scripts/game/board.js)** — viewport zoom/pan, screen↔board coordinate transforms, `fitToContent()` and `panTo()`.
- **[src/scripts/game/card.js](src/scripts/game/card.js)** — DOM creation for board and panel cards.
- **[src/scripts/game/drag.js](src/scripts/game/drag.js)** — Pointer Events drag system. Handles tap-to-place (pointerdown+up at same position → `quickPlaceCard`) and full drag (pointermove past threshold → drag mode).

### Data & content

- **[content/cards.csv](content/cards.csv)** — source of truth for the deck (44 cards as of writing).
- **[scripts/build-card-library.mjs](scripts/build-card-library.mjs)** — CSV parser, validator, JS module emitter. Run by `predev` and `prebuild` hooks.
- **[src/scripts/data/card-library.js](src/scripts/data/card-library.js)** — auto-generated. Header warns against hand-editing. Tracked in git for clone-and-go.
- **[src/scripts/framing/templates.js](src/scripts/framing/templates.js)** — question shape definitions (Shape a future / Explore consequences / Find pathways), slots, helper text.

---

## Design decisions worth knowing

### Curveballs are timeline citizens, ripples are not

A curveball is an *event in time* — "we did A, then COVID happened, so we did B differently". It belongs on the line. Curveballs have `lane: 'timeline'` and `linkedTo` (for the "presses X" badge). They insert *after* their target action, pushing later cards right.

A ripple is a *consequence radiating outward* — "this action caused public-trust gain over here AND collaboration improvement over there". It belongs off the line, branching above/below. Ripples keep their floating position via `findNearestLinkTarget` re-anchor on drag.

This split teaches the foresight conceptual difference for free: things on the line happen *to me*, things off the line happen *because of me*. Don't merge the two.

### Heartbeat is local-only

Every 20s, `heartbeat()` updates `gameState.participants[me].lastSeenAt` locally and re-renders the participant rail. It does **not** call `emitStateChange()`.

Why: the heartbeat used to write the full game state to Firestore. If Tab B's heartbeat fired during the brief window between Tab A advancing to curveball and Tab B receiving that snapshot, Tab B would write its stale `phase: 'planning'` and revert Tab A. Last-writer-wins on the wrong field.

Trade-off: a purely-idle observer's online dot drifts stale on other tabs. Active players refresh each other through normal state writes (any card placement, edit, phase advance).

If you want to fix the trade-off properly: write only `state.participants[i]` to Firestore using field-level merges, never the whole state. Requires careful work because Firestore merge replaces arrays wholesale; you'd need a map keyed by participant id, not an array.

### Sticky-by-name participants

When a tab joins a room, it first checks if there's a same-name participant whose `lastSeenAt` is older than the online window (45s). If so, it **reclaims the slot** — replaces the sessionId, bumps lastSeenAt, keeps the original participant id. Only creates a new participant if no idle slot is available.

This stops Alice piling up "Alice / Alice (idle) / Alice (idle)" rows in everyone's rail every reconnect. If two people are both genuinely named Alice and both online, the second Alice creates a new slot — we don't hijack an active session.

### `getTimelineCards()` is the central truth

Read in 5+ places. Returns `[begin, ...middleCardsByX, end]` where `middle` is actions and inline curveballs. `relayoutTimelineCards`, `timeline.drawConnections`, the END-card-push logic in `quickPlaceCard` — all read from this. One filter change cascades through.

### `syncRemoteState` diffs before re-rendering

The previous version always tore the board down and re-rendered on every remote snapshot. With heartbeats firing every 20s × N tabs, this caused a flash every ~20s on observers. The current version:

1. Computes `cardsChanged`, `connectionsChanged`, etc. by JSON-comparing snapshot vs current state.
2. Only does the heavy `querySelectorAll('.board-card').forEach(remove) + renderExistingCards + relayoutBoard` if board content actually changed.
3. Phase-only changes go through `phases.setPhase` which already updates the panel/topbar — no board re-render needed.
4. Participant-only changes update only the rail.

### Framing question/goal can be edited mid-game

The framing strip's expanded view has an "✎ Edit framing" button that opens a modal. The save handler updates `gameState.framing.composedQuestion` and `gameState.framing.goal`, AND mirrors to the begin card description and end card title+description (since those are derivative of framing). Fires `emitStateChange()` so other tabs sync.

---

## Gotchas

### Closures over mutable state in event handlers

The story panel render captured `summary` in a closure for the Export button. The notebook textarea handler intentionally writes to `gameState.phaseNotes` *without* re-rendering the panel (to preserve textarea focus on every keystroke). So by the time the user clicks Export, the captured `summary` is missing whatever they just typed.

**Rule**: for handlers reading "current" state, compute on click, not on render. The cost of an extra `buildStorySummary()` per click is microscopic; the bug it prevents is invisible until someone tries to use the feature.

### Pointer Events vs HTML Drag API

The board uses CSS transforms for the zoom/pan layer. The HTML Drag API doesn't compose with CSS transforms (the drag image is wrong, drop targets misalign). Pointer Events is the only sound choice. If you ever need to add a new drag interaction, follow the existing `startPanelDrag` / `startBoardDrag` pattern in `drag.js`.

### Action card placement isn't a `click` event

Tapping a panel card to place it goes through `pointerdown` + `pointerup`. The drag system distinguishes a tap (no movement) from a drag (movement past threshold). Synthetic `click()` does nothing — to test programmatically, dispatch real `PointerEvent`s.

### Vite HMR can look like a bug

In dev mode, editing source files reloads the page, which in a multi-tab test can look exactly like an unwanted "page reload bug". The user reported this once — it was Vite, not the app. Production (Firebase Hosting) is static and doesn't behave this way.

### Firebase config errors are silent if env vars are missing

`.env` is gitignored. A fresh checkout with no `.env` will have `firebaseEnabled = false` and the app falls back to local-only mode. Symptoms: rooms work in your tab but don't sync to others. Always check `.env` exists with all `PUBLIC_FIREBASE_*` vars before debugging sync.

---

## Verification

```bash
npm run build
```

Runs `prebuild` (regenerates card library from CSV, validates) and then full Astro build. Currently passes cleanly.

Functional smoke test loop:

1. `npm run dev`
2. Open `http://localhost:4321/`
3. Click "Try the Demo" → should land on the FTR-DEMO board with a pre-built scenario
4. Click "Play Now" → lobby → create room → framing → game
5. Open the same room URL in a second browser/incognito → should see the first player's state
6. Place cards in tab A, observe tab B updates without flash
7. Advance phases — state should sync, no reverts
8. Reach Reflection phase → write a note → click Export PDF → browser print dialog opens with formatted summary

---

## What's not done yet

- **Welsh-language deck.** CSV format makes this a column-add change (`title_cy`, `description_cy`), but the runtime locale switch isn't built. Likely cleanest path: a `?lang=cy` URL param wires through the join flow into a `localeFor(card)` helper at panel render time.
- **Drag-to-link relationship authoring.** Currently links are heuristic (nearest target). The "Link Cards" button is the manual override. Drag-from-card-edge-to-card-edge would be more discoverable.
- **Server-side host permissions.** The host distinction is purely UI; there's nothing stopping a non-host editing a card. For workshop use the trust model is fine; for public use it's not.
- **Polished session capture beyond PDF.** Could add board-snapshot image embedded in the PDF, or a `.pptx` export for slide decks.
- **Onboarding guided tour.** Most facilitators will figure it out, but a first-run overlay would lower the floor.

---

## If a future agent picks this up

> Continue building the Futures Card Game. The app is deployed at hwbcards.web.app with realtime Firebase sync, a guided framing flow, inline curveballs, custom card creation, in-game framing edit, and PDF export. Card content lives in `content/cards.csv` and is generated to JS at build time. Architecture: Astro static + vanilla JS, Pointer Events for drag, Firestore one-doc-per-room with debounced writes. Read README.md and this file before changing code. The most likely next slices: Welsh-language deck (CSV column-add + runtime locale), board-snapshot embed in PDF, drag-to-link authoring, or workshop facilitator onboarding.
