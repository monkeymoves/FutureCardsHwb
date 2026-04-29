import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
  databaseURL: import.meta.env.PUBLIC_FIREBASE_DATABASE_URL,
};

const REQUIRED_ENV_KEYS = [
  'PUBLIC_FIREBASE_API_KEY',
  'PUBLIC_FIREBASE_AUTH_DOMAIN',
  'PUBLIC_FIREBASE_PROJECT_ID',
  'PUBLIC_FIREBASE_STORAGE_BUCKET',
  'PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'PUBLIC_FIREBASE_APP_ID',
  'PUBLIC_FIREBASE_DATABASE_URL',
];

export const firebaseEnabled = REQUIRED_ENV_KEYS.every((key) => Boolean(import.meta.env[key]));

// Keep Firebase optional so the app can run as a local prototype before sync is wired in.
const app = firebaseEnabled ? initializeApp(firebaseConfig) : null;

export const auth = app ? getAuth(app) : null;
// `ignoreUndefinedProperties: true` is a defensive belt-and-braces — Firestore
// rejects writes that contain `undefined` field values with an opaque error
// from inside its serialiser ("Cannot read properties of undefined / payload").
// We try not to ever pass undefined, but if a future code path does, the SDK
// silently strips it instead of crashing the client.
export const db = app
  ? initializeFirestore(app, { ignoreUndefinedProperties: true })
  : null;
export const rtdb = app ? getDatabase(app) : null;
export default app;
