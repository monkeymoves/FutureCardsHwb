/**
 * Firebase sync for the Futures Card Game.
 *
 * Strategy: one Firestore document per room (`rooms/{roomCode}`).
 *   - Each write stamps `lastWriterSessionId` — a random ID generated fresh on
 *     every page load — so listeners can skip their own echoes without treating
 *     two tabs in the same browser as the same writer (which the Firebase UID
 *     would do, since anonymous UIDs persist across tabs).
 *   - Writes are debounced (800 ms) so rapid card moves don't flood Firestore.
 *   - Participants are NOT synced — each client owns its own local list.
 *
 * Returns null if Firebase is not configured (graceful local-only fallback).
 */

import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, firebaseEnabled } from './config.js';
import { signInAnon } from './auth.js';

const WRITE_DEBOUNCE_MS = 800;

/**
 * Initialise Firebase sync for a room.
 * @param {string} roomCode
 * @returns {Promise<SyncHandle|null>}
 */
export async function initSync(roomCode) {
  if (!firebaseEnabled || !db) {
    console.info('[sync] Firebase not configured — running in local-only mode.');
    return null;
  }

  let user;
  try {
    user = await signInAnon();
    console.info(`[sync] Signed in anonymously as ${user.uid.slice(0, 8)}…`);
  } catch (err) {
    console.error('[sync] Anonymous auth failed:', err.code, err.message);
    return null;
  }

  // A random ID unique to THIS page load (not the browser session).
  // Using this instead of user.uid means two tabs in the same browser each get
  // their own session ID, so they correctly receive each other's updates.
  const mySessionId = crypto.randomUUID();

  const roomRef = doc(db, 'rooms', roomCode);

  let initialState = null;
  try {
    const snap = await getDoc(roomRef);
    if (snap.exists() && snap.data()?.state) {
      initialState = snap.data().state;
      console.info(`[sync] Loaded existing room state for ${roomCode}.`);
    } else {
      console.info(`[sync] New room ${roomCode} — this client will create it.`);
    }
  } catch (err) {
    console.warn('[sync] Could not load room from Firestore:', err.code);
  }

  let unsubscribe = null;
  let writeTimer = null;

  return {
    uid: user.uid,
    sessionId: mySessionId,
    initialState,

    writeState(snapshot) {
      clearTimeout(writeTimer);
      writeTimer = setTimeout(() => {
        // Only `lastPanelType` is excluded from sync — participants are now part
        // of shared state so every tab sees who's actually in the room.
        const { lastPanelType, ...sharedState } = snapshot;
        setDoc(
          roomRef,
          {
            roomId: roomCode,
            lastWriterSessionId: mySessionId,
            lastWrittenAt: serverTimestamp(),
            state: sharedState,
          },
          { merge: true }
        ).catch((err) => console.error('[sync] Write failed:', err.code, err.message));
      }, WRITE_DEBOUNCE_MS);
    },

    subscribe(onRemoteChange) {
      unsubscribe = onSnapshot(
        roomRef,
        (docSnap) => {
          if (!docSnap.exists()) return;
          const data = docSnap.data();
          // Skip echoes from this exact page-load session only.
          if (data.lastWriterSessionId === mySessionId) return;
          if (data.state) {
            console.info('[sync] Remote state received — applying to board.');
            onRemoteChange(data.state);
          }
        },
        (err) => console.warn('[sync] Snapshot error:', err.code)
      );
      return unsubscribe;
    },

    dispose() {
      clearTimeout(writeTimer);
      unsubscribe?.();
    },
  };
}
