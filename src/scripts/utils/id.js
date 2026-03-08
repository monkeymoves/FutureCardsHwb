const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode() {
  let code = 'FTR-';
  for (let i = 0; i < 4; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

export function generateCardId() {
  const timestamp = Date.now().toString(36);
  let random = '';
  for (let i = 0; i < 6; i++) {
    random += CHARS[Math.floor(Math.random() * CHARS.length)].toLowerCase();
  }
  return `card-${timestamp}-${random}`;
}

export function generateConnectionId() {
  return `conn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
