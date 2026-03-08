# Futures Card Game — Handover

## Summary

This repo is a futures workshop card-game prototype inspired by the physical brief in `LO4 Instructions - Card Game.docx`.

The current direction is:

- one host
- multiple players
- a shared board
- a guided phase flow
- a useful session takeaway at the end

It should be thought of as a local v1 prototype, not a completed multiplayer product.

## Current UX / Product Position

The board is no longer trying to be a generic canvas with lots of helper chrome. The current UX is intentionally simpler:

- the board surface is mostly open
- the right tray is the main control surface
- any board-card click opens the modal editor
- dragging only starts after real movement
- notes live in the `Notebook` view, not as duplicate canvas widgets
- `Notebook` mode expands wider and hides the card tray content so the output workspace gets the room instead

That was a deliberate product correction. Earlier versions had too many on-canvas explanations and too much tiny-control interaction.

## What Is Live Right Now

### Routes

- `/` landing page
- `/about` rules / framing page
- `/lobby` local room create/join flow
- `/game` seeded demo board
- `/game?room=FTR-ABCD` named local room

### Playable Flow

1. `Setup`
   Click the blue start/end cards and define the scenario.
2. `Planning`
   Build the core pathway with action cards.
3. `Curveball`
   Add disruptions and, if needed, new response actions.
4. `Ripple`
   Add wider effects that emerge from choices, disruptions, or responses.
5. `Reflection`
   Review the board and capture the session takeaway in the notebook/export view.

### Current Prototype Features

- zoom and pan on a large board surface
- tray-to-board placement via click or drag
- board-card repositioning
- host/player switching with per-card ownership
- stable core-path reflow for `beginning -> actions -> end goal`
- branch response actions during later phases
- automatic curveball / ripple linking with visible relationship lines
- whole-card modal editing for all cards
- notebook view with copy/download text export plus more structured workshop-summary sections
- phase-aware deck guidance so players can tell whether they are building the main path, pressuring it, tracing effects, or adding a response
- local room persistence in `localStorage`

## Architecture Snapshot

### Frontend

- Astro for routes and layout
- vanilla JS for game state and interaction systems
- plain CSS for cards, board, and tray visuals

### Important Files

- `src/pages/game.astro`
  Main game shell: top bar, board viewport, tray, and modal mount points.
- `src/scripts/game/engine.js`
  Main orchestration layer. This is the file to read first for game logic.
  Responsibilities:
  - phases
  - tray population
  - modal editing
  - participant switching
  - card placement / movement / removal
  - notebook/export rendering
  - persistence snapshots
- `src/scripts/game/drag.js`
  Pointer drag system. Important recent change: board-card drag now waits for movement threshold so click-to-edit works properly.
- `src/scripts/game/timeline.js`
  Draws the core pathway plus relationship lines for curveballs, ripples, and response actions.
- `src/scripts/game/board.js`
  Zoom/pan controller and board coordinate conversion.
- `src/scripts/game/card.js`
  Board/tray card DOM creation.
- `src/scripts/game/phases.js`
  Phase metadata and per-phase placement rules.

### Data

- `src/scripts/data/card-library.js`
  Built-in action, curveball, and ripple decks.

### Firebase

These helpers exist but are not wired into the current board flow yet:

- `src/scripts/firebase/config.js`
- `src/scripts/firebase/auth.js`
- `src/scripts/firebase/firestore.js`

## Important Product / UX Decisions

### 1. Host + Players

The app no longer tries to model a lot of different roles. The useful distinction is:

- host
- players

That is simpler for remote facilitation and simpler in the UI.

### 2. Modal Editing Is the Default

Tiny per-card edit/delete controls were removed from the board flow.

Current rule:

- click card -> open editor
- drag card -> reposition card

This is much easier to understand on laptop screens.

### 3. Notebook Is the Place for Takeaways

Phase notes are no longer duplicated on the canvas.

The `Notebook` view now:

- captures the current phase takeaway
- shows the evolving session story
- supports copy/download export

### 4. Branching Matters More Than a Perfect Timeline

The core path is still ordered, but the product is no longer trying to force every idea into one rigid straight line.

Current structure:

- main pathway = core actions between start and end
- curveballs = pressures on the path
- ripples = wider effects
- response actions = adaptations that branch from a source card

### 5. The Tray Has Two Distinct Jobs

`Cards` mode is for play.

- choose a deck
- see what that deck does in the current phase
- place cards quickly

`Notebook` mode is for facilitation output.

- capture the strongest takeaway for the phase
- review the session as a workshop brief
- export summary text

## Persistence / Routing

The board currently supports two static-friendly entry points:

- `/game`
- `/game?room=FTR-ABCD`

Room state is saved in `localStorage` under the room code.

This was chosen because the project is still static Astro output. Query-param rooms work without moving to SSR.

## What Is Not Done Yet

- realtime room sync across devices
- Firestore-backed lobby / room state
- host-only permissions enforced across real clients
- presence / cursors
- polished export artifact beyond text summary
- drag-to-link relationship authoring
- player proposal / host approval flow for custom cards

## Current Risks

1. Same room code on different devices does not sync.
2. The relationship model is usable but still heuristic: nearest/select-based rather than explicit authored links.
3. The export is directionally useful but still not presentation-quality.
4. First-run onboarding is still light. A real facilitator probably needs a clearer guided intro.

## Recommended Next Slice

If continuing toward a real v1, the highest-value next steps are:

1. Wire named rooms to Firebase.
2. Add realtime state and basic presence.
3. Upgrade notebook/export into a proper end-of-session artifact.
4. Add host moderation for custom player-submitted cards.

## Verification

Current verified command:

```bash
npm run build
```

Build passes.

## Repo Note

At the time of this handover, the working folder is not an initialized git repository yet. The docs are now aligned for a cleaner repo creation point.

## Resume Prompt

If another session picks this up:

> Continue building the Futures Card Game from the current local v1 prototype. The tray, board, phases, host/player model, branching response actions, modal editing, and notebook/export flow are all working locally. Next priority: Firebase-backed shared rooms plus a polished end-of-session artifact. Read `HANDOVER.md` and `README.md` first.
