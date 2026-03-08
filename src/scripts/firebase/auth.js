import { signInAnonymously, onAuthStateChanged, updateProfile } from 'firebase/auth';
import { auth, firebaseEnabled } from './config.js';

let currentUser = null;
const authReadyCallbacks = [];

if (auth) {
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    authReadyCallbacks.forEach((cb) => cb(user));
    authReadyCallbacks.length = 0;
  });
}

function assertAuthConfigured() {
  if (!auth) {
    throw new Error(
      'Firebase Auth is not configured. Add the PUBLIC_FIREBASE_* variables before using auth helpers.'
    );
  }
}

export function isAuthConfigured() {
  return firebaseEnabled && Boolean(auth);
}

export function waitForAuth() {
  return new Promise((resolve) => {
    if (!auth) {
      resolve(null);
    } else if (currentUser) {
      resolve(currentUser);
    } else {
      authReadyCallbacks.push(resolve);
    }
  });
}

export async function signInAnon() {
  assertAuthConfigured();
  const result = await signInAnonymously(auth);
  return result.user;
}

export async function setDisplayName(name) {
  assertAuthConfigured();
  if (auth.currentUser) {
    await updateProfile(auth.currentUser, { displayName: name });
  }
}

export function getCurrentUser() {
  return auth.currentUser;
}

export function getCurrentUserId() {
  return auth.currentUser?.uid || null;
}
