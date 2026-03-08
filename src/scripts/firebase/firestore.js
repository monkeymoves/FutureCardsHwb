import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  where,
} from 'firebase/firestore';
import { db } from './config.js';

function assertFirestoreConfigured() {
  if (!db) {
    throw new Error(
      'Firebase Firestore is not configured. Add the PUBLIC_FIREBASE_* variables before using room sync.'
    );
  }
}

// === Room Operations ===

export async function createRoom(roomId, data) {
  assertFirestoreConfigured();
  const ref = doc(db, 'rooms', roomId);
  await setDoc(ref, {
    roomId,
    name: data.name,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: data.createdBy,
    facilitatorId: data.createdBy,
    phase: 'setup',
    scenarioBeginning: '',
    scenarioEndGoal: '',
    settings: {
      maxPlayers: 12,
      allowCustomCards: true,
    },
    status: 'waiting',
  });
  return roomId;
}

export async function getRoom(roomId) {
  assertFirestoreConfigured();
  const ref = doc(db, 'rooms', roomId);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function updateRoom(roomId, data) {
  assertFirestoreConfigured();
  const ref = doc(db, 'rooms', roomId);
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
}

export function subscribeToRoom(roomId, callback) {
  assertFirestoreConfigured();
  const ref = doc(db, 'rooms', roomId);
  return onSnapshot(ref, (snap) => {
    callback(snap.exists() ? snap.data() : null);
  });
}

// === Player Operations ===

export async function addPlayer(roomId, player) {
  assertFirestoreConfigured();
  const ref = doc(db, 'rooms', roomId, 'players', player.uid);
  await setDoc(ref, {
    uid: player.uid,
    displayName: player.displayName,
    color: player.color,
    role: player.role,
    joinedAt: serverTimestamp(),
    isOnline: true,
  });
}

export async function getPlayers(roomId) {
  assertFirestoreConfigured();
  const ref = collection(db, 'rooms', roomId, 'players');
  const snap = await getDocs(ref);
  return snap.docs.map((d) => d.data());
}

export function subscribeToPlayers(roomId, callback) {
  assertFirestoreConfigured();
  const ref = collection(db, 'rooms', roomId, 'players');
  return onSnapshot(ref, (snap) => {
    callback(snap.docs.map((d) => d.data()));
  });
}

// === Card Operations ===

export async function addCard(roomId, card) {
  assertFirestoreConfigured();
  const ref = doc(db, 'rooms', roomId, 'cards', card.cardId);
  await setDoc(ref, {
    ...card,
    placedAt: serverTimestamp(),
    lastMovedAt: serverTimestamp(),
  });
}

export async function updateCard(roomId, cardId, data) {
  assertFirestoreConfigured();
  const ref = doc(db, 'rooms', roomId, 'cards', cardId);
  await updateDoc(ref, { ...data, lastMovedAt: serverTimestamp() });
}

export async function removeCard(roomId, cardId) {
  assertFirestoreConfigured();
  const ref = doc(db, 'rooms', roomId, 'cards', cardId);
  await deleteDoc(ref);
}

export function subscribeToCards(roomId, callback) {
  assertFirestoreConfigured();
  const ref = collection(db, 'rooms', roomId, 'cards');
  return onSnapshot(ref, (snap) => {
    const cards = {};
    snap.docs.forEach((d) => {
      cards[d.id] = d.data();
    });
    callback(cards);
  });
}

// === Connection Operations ===

export async function addConnection(roomId, connection) {
  assertFirestoreConfigured();
  const ref = doc(db, 'rooms', roomId, 'connections', connection.connectionId);
  await setDoc(ref, connection);
}

export async function removeConnection(roomId, connectionId) {
  assertFirestoreConfigured();
  const ref = doc(db, 'rooms', roomId, 'connections', connectionId);
  await deleteDoc(ref);
}

export function subscribeToConnections(roomId, callback) {
  assertFirestoreConfigured();
  const ref = collection(db, 'rooms', roomId, 'connections');
  return onSnapshot(ref, (snap) => {
    callback(snap.docs.map((d) => d.data()));
  });
}

// === Save/Load Operations ===

export async function saveGame(saveId, roomId, userId, snapshot) {
  assertFirestoreConfigured();
  const ref = doc(db, 'savedGames', saveId);
  await setDoc(ref, {
    saveId,
    roomId,
    savedAt: serverTimestamp(),
    savedBy: userId,
    snapshot,
  });
}

export async function loadGame(saveId) {
  assertFirestoreConfigured();
  const ref = doc(db, 'savedGames', saveId);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}
