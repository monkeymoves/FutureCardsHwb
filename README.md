# Futures Card Game

A local-first futures workshop prototype built with Astro and vanilla JavaScript.

The product direction is now clearer than it was at the start of the repo: this is not a generic whiteboard. It is a guided card game for exploring a future issue, building a pathway, introducing disruptions, tracing ripple effects, and leaving the session with a usable story and conclusion.

## Current Product Shape

The current prototype supports a single local browser session with a lightweight `Host + Players` model.

Players can:

- define a starting situation and end goal
- build a core pathway with action cards
- introduce curveballs that pressure the pathway
- add ripple cards that show wider effects
- add response actions after disruption instead of freezing the story
- click any board card to edit it in a modal
- capture phase takeaways in a notebook/export view
- generate a more structured workshop summary with signals and next steps

The app is usable as a local v1 prototype. It is not yet a shared realtime multiplayer product.

## Routes

- `/` landing page
- `/about` rules / framing page
- `/lobby` create or join a named room
- `/game` seeded demo board for quick testing
- `/game?room=FTR-ABCD` named local room

Room state is currently stored in `localStorage` per room code, so a room can be reopened in the same browser. Different devices do not sync yet.

## Gameplay Model

The current board flow is:

1. `Setup`
   Click the blue anchor cards and define the present situation plus desired future.
2. `Planning`
   Use action cards to build the main pathway.
3. `Curveball`
   Add disruptions and, if needed, branch in new response actions.
4. `Ripple`
   Show knock-on effects of actions, disruptions, or adaptations.
5. `Reflection`
   Review the board and capture the key takeaway in the notebook/export panel.

Important interaction rules:

- Any board card click opens the editor modal.
- Dragging is still supported, but it only starts after real pointer movement so it does not fight with editing.
- The core pathway reflows into a stable `beginning -> actions -> end goal` order.
- Response actions stay off the core path and branch from a chosen source card.
- Curveballs and ripples auto-link to nearby or selected source cards and render with relationship lines plus badges.
- In later phases, the tray explains what a new card will do now, including the current focus card it will pressure, affect, or respond to.

## Stack

- Astro for pages and layout
- vanilla JavaScript for board state, phases, layout, and drag interactions
- CSS files for the board, panel, and card system
- Firebase helpers scaffolded for future auth / shared persistence

## Running Locally

```bash
npm install
npm run dev
npm run build
npm run preview
```

`npm run build` currently passes.

## Project Structure

```text
src/
├── components/
├── layouts/
├── pages/
│   ├── index.astro
│   ├── about.astro
│   ├── lobby.astro
│   └── game.astro
├── scripts/
│   ├── data/
│   ├── firebase/
│   ├── game/
│   └── utils/
└── styles/
```

Key game files:

- `src/scripts/game/engine.js`
  Main board orchestration: phases, placement rules, panel state, modal editing, participants, notebook/export, and persistence callbacks.
- `src/scripts/game/drag.js`
  Pointer-based drag system for tray placement and board repositioning.
- `src/scripts/game/timeline.js`
  Main pathway and relationship line drawing.
- `src/scripts/game/board.js`
  Zoom/pan transform controller and board coordinate maths.
- `src/scripts/game/card.js`
  DOM creation for board cards and tray cards.

## Firebase Setup

Firebase is optional right now. The helpers are scaffolded but not wired into the board UI yet.

If you want to work on auth or shared room sync next, add these public env vars to `.env`:

```bash
PUBLIC_FIREBASE_API_KEY=
PUBLIC_FIREBASE_AUTH_DOMAIN=
PUBLIC_FIREBASE_PROJECT_ID=
PUBLIC_FIREBASE_STORAGE_BUCKET=
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
PUBLIC_FIREBASE_APP_ID=
PUBLIC_FIREBASE_DATABASE_URL=
```

The Firebase helpers now fail clearly when config is missing instead of silently booting a broken client.

## What Works Well Now

- clearer board focus with less on-canvas clutter
- whole-card click editing instead of tiny `E` / `X` controls
- host/player switching and ownership badges
- stronger card-type switching in the tray, including clearer response/curveball/ripple intent
- notebook/export mode that expands wider, hides the card tray, and uses the captured phase notes
- branching response actions so the game is not locked to a single rigid line
- more useful workshop output sections, including signals to watch and immediate next steps

## Current Limits

- no realtime multiplayer sync across browsers
- no Firestore-backed room loading yet
- no cursor / presence system
- story export is still text-first rather than a polished facilitation artifact
- link attachment is still proximity/select based rather than explicit drag-to-link interaction

## Recommended Next Steps

1. Replace local room persistence with Firebase-backed room state.
2. Add presence and shared cursor awareness for remote sessions.
3. Turn notebook/export into a proper end-of-session artifact: structured summary, PDF, and board capture.
4. Add player-submitted custom cards with host approval.
5. Add a clearer in-app onboarding layer for first-time facilitators.
