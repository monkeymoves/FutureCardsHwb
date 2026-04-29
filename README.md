# Futures Card Game

A real-time multiplayer strategic foresight card game for the browser, digitising a workshop format used by Welsh public service boards, environmental planners, and policy teams.

Teams build a **pathway** between a starting situation and a goal, then stress-test that plan with **curveballs** (disruptions) and **ripples** (consequences).

**Live at: [hwbcards.web.app](https://hwbcards.web.app)**

---

## Quick start

```bash
npm install
npm run dev
```

The dev server runs at `http://localhost:4321`. The `predev` hook regenerates the card library from `content/cards.csv` automatically.

```bash
npm run build       # production build (also regenerates cards via prebuild)
npm run preview     # serve the built bundle
npm run cards:build # regenerate src/scripts/data/card-library.js from content/cards.csv
```

---

## Routes

| Path | Purpose |
|---|---|
| `/` | Landing page with feature overview |
| `/about` | Rules + how a session unfolds |
| `/lobby` | Create a new room or join an existing one by code |
| `/framing?room=…&name=…` | Pre-game framing — agree the question shape, slots, and goal |
| `/game?room=…&name=…` | The board (real users arrive via lobby + framing) |
| `/game` | `FTR-DEMO` seeded board — no Firebase, fresh every load, useful for showing the product |

---

## Gameplay flow

1. **Setup** — drop the blue Begin card (today's situation) and End card (the future you're aiming for). The framing's `presentState`/`system` slot pre-fills the begin title; the goal becomes the end card.
2. **Planning** — build the pathway with action cards. They sit left-to-right between begin and end.
3. **Curveball** — drop disruptions onto the timeline. Curveballs are *inline events*: they insert after the action they pressure, pushing later cards right. Any actions added afterwards read as the team's response by virtue of their position.
4. **Ripple** — map knock-on consequences. Ripples branch *off* the timeline above/below — they're parallel effects, not events on the path.
5. **Reflection** — review the board, capture the headline takeaway in the Notebook, and Export PDF for a formatted session record.

---

## Stack

- **Astro** for static pages and the game shell (no SSR)
- **Vanilla JavaScript** for game state and interaction systems
- **CSS** with phase-aware custom properties — colour switches with the active phase
- **Pointer Events** for drag (HTML Drag API doesn't compose with CSS transforms)
- **Firebase Firestore** for room state and realtime sync
- **Firebase Anonymous Auth** for participant identity
- **Firebase Hosting** for deployment (auto-rebuilds on push)
- **`window.print()`** for PDF export — no jsPDF in client bundle

---

## Project structure

```text
content/
  cards.csv                     ← human-edited source of truth for the deck
scripts/
  build-card-library.mjs        ← CSV → JS module generator
src/
  pages/
    index.astro                 ← landing
    about.astro                 ← rules
    lobby.astro                 ← create/join room
    framing.astro               ← pre-game framing form
    game.astro                  ← board shell + boot logic
  scripts/
    data/
      card-library.js           ← AUTO-GENERATED — do not hand-edit
    firebase/
      config.js                 ← Firebase init from env vars
      auth.js                   ← anonymous sign-in
      sync.js                   ← Firestore room sync (debounced writes)
    framing/
      templates.js              ← question shapes, slots, helper text
    game/
      engine.js                 ← orchestrator (read this first)
      board.js                  ← zoom/pan + screen↔board coordinates
      card.js                   ← board/panel card DOM creation
      drag.js                   ← Pointer Events drag system
      phases.js                 ← phase state machine + allowed card types
      timeline.js               ← left-to-right layout + connection arrows
  styles/
    board.css panel.css cards.css global.css lobby.css
```

---

## Card content workflow

Cards are content, not code. To add or edit cards:

1. Open `content/cards.csv` in Excel, Google Sheets, or any text editor.
2. Add a row: `id,type,title,description` (e.g. `CRV-13,curveball,Vendor goes bust,Your tech provider exits the market.`).
3. Save. The next `npm run dev` or `npm run build` regenerates `src/scripts/data/card-library.js` automatically.
4. Validation (run on every regen) catches: duplicate IDs, invalid `type` values, missing required fields, mismatched columns. Errors point to the specific line.

Run `npm run cards:build` standalone to regenerate without starting the dev server.

The generated file is committed to git so a fresh clone works without first running the generator.

---

## Firebase setup

Required env vars in `.env` for the room-sync features:

```bash
PUBLIC_FIREBASE_API_KEY=
PUBLIC_FIREBASE_AUTH_DOMAIN=
PUBLIC_FIREBASE_PROJECT_ID=
PUBLIC_FIREBASE_STORAGE_BUCKET=
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
PUBLIC_FIREBASE_APP_ID=
PUBLIC_FIREBASE_DATABASE_URL=
```

Without these, the app falls back to local-only mode (state persists to `localStorage`, no cross-tab sync). The `FTR-DEMO` room always runs local-only by design.

Firestore security rules live at the project level — they require `request.auth != null` (anonymous sign-in is allowed). Each room is a single document at `rooms/{roomCode}` with the entire state in a `state` field, written with debounced merges so rapid edits don't flood Firestore.

---

## Deployment

Static hosting via Firebase Hosting:

```bash
npm run build              # also runs prebuild → cards:build
firebase deploy --only hosting
```

`firebase.json` rewrites all routes to `/index.html` so Astro's client-side routing works in static-served mode.

---

## Known limitations

- **Connection lines and ripple anchors are heuristic.** Curveballs/ripples auto-link to the nearest plausible target; users can override with the Link Cards button (manual drag-to-link), but there's no first-class "this connects to that" authoring flow.
- **Welsh-language deck not yet wired.** The CSV format makes this a one-column-add change, but the runtime locale switch isn't built. See [HANDOVER.md](HANDOVER.md).
- **Heartbeat is local-only**, which is correct for not racing phase changes but means a purely-idle observer's "online" dot can drift stale on other tabs. Active players refresh each other through the normal state writes.
- **No host-only permissions** are enforced server-side. The role distinction is purely UI affordance.
