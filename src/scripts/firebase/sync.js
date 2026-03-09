/**
 * Firebase sync for the Futures Card Game.
 *
 * Strategy: one Firestore document per room (`rooms/{roomCode}`).
 *   - Each write stamps `lastWriterUid` so listeners can skip their own echoes.
 *   - Writes are debounced (800 ms) so rapid card moves don't flood Firestore.
 *   - Participants are NOT synced via Firestore — each client manages its own
 *     local participant list. Only gameplay state (cards, phase, connections,
 *     phaseNotes) is shared.
 *
 * Returns null if Firebase is not configured, so the game degrades gracefully
 * to localStorage-only mode.
 */

import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, firebaseEnabled } from './config.js';
import { signInAnon } from './auth.js';

// How long to wait after the last state change before writing to Firestore.
// Prevents flooding on every pointer-move event during card drags.
const WRITE_DEBOUNCE_MS = 800;

/**
 * Initialise Firebase sync for a room.
 *
 * @param {string} roomCode - Firestore document ID (the room code from the URL).
 * @returns {Promise<SyncHandle|null>} Sync handle, or null if Firebase unavailable.
 */
export async function initSync(roomCode) {
  if (!firebaseEnabled || !db) {
    console.info('[sync] Firebase not configured — running in local-only mode.');
    return null;
  }

  // Anonymous auth — creates a persistent anonymous account per browser.
  // Subsequent page loads reuse the same UID via the Firebase SDK's persistence.
  let user;
  try {
    user = await signInAnon();
    console.info(`[sync] Signed in anonymously as ${user.uid.slice(0, 8)}…`);
  } catch (err) {
    console.error('[sync] Anonymous auth failed:', err.code, err.message);
    return null;
  }

  const myUid = user.uid;
  const roomRef = doc(db, 'rooms', roomCode);

  // Load the current room state (if it already exists).
  let initialState = null;
  try {
    const snap = await getDoc(roomRef);
    if (snap.exists() && snap.data()?.state) {
      initialState = snap.data().state;
      console.info(`[sync] Loaded existing room state for ${roomCode}.`);
    } else {
      console.info(`[sync] No existing state for ${roomCode} — this client will create it.`);
    }
  } catch (err) {
    console.warn('[sync] Could not load room from Firestore:', err.code);
    // Non-fatal — start fresh and write on first state change.
  }

  let unsubscribe = null;
  let writeTimer = null;

  /** @type {SyncHandle} */
  const handle = {
    /** The Firebase UID for the current anonymous session. */
    uid: myUid,

    /**
     * The room's current state from Firestore, or null if the room is new.
     * game.astro uses this as `initialState` for the engine.
     */
    initialState,

    /**
     * Write the full game snapshot to Firestore (debounced).
     * Called from the engine's `onStateChange` callback.
     * Participants are stripped before writing — they're local-only.
     *
     * @param {object} snapshot - Full game state snapshot from snapshotState().
     */
    writeState(snapshot) {
      clearTimeout(writeTimer);
      writeTimer = setTimeout(() => {
        // Strip client-local fields before writing to shared store.
        const { participants, activeParticipantId, lastPanelType, ...sharedState } = snapshot;

        setDoc(
          roomRef,
          {
            roomId: roomCode,
            lastWriterUid: myUid,
            lastWrittenAt: serverTimestamp(),
            state: sharedState,
          },
          { merge: true }
        ).catch((err) => console.error('[sync] Write failed:', err.code, err.message));
      }, WRITE_DEBOUNCE_MS);
    },

    /**
     * Subscribe to state changes pushed by other clients.
     * Only fires when `lastWriterUid !== myUid` (echo prevention).
     *
     * @param {function(object): void} onRemoteChange - Called with the remote state snapshot.
     * @returns {function} Unsubscribe function.
     */
    subscribe(onRemoteChange) {
      unsubscribe = onSnapshot(
        roomRef,
        (docSnap) => {
          if (!docSnap.exists()) return;
          const data = docSnap.data();

          // Skip echoes of our own writes.
          if (data.lastWriterUid === myUid) return;

          if (data.state) {
            console.info('[sync] Remote state received — applying to board.');
            onRemoteChange(data.state);
          }
        },
        (err) => {
          // Snapshot errors are non-fatal (e.g. offline, permission denied).
          console.warn('[sync] Snapshot listener error:', err.code);
        }
      );
      return unsubscribe;
    },

    /** Flush pending write and tear down the Firestore listener. */
    dispose() {
      clearTimeout(writeTimer);
      unsubscribe?.();
    },
  };

  return handle;
}
