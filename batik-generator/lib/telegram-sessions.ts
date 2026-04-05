/**
 * In-memory session store for Telegram bot ↔ website communication.
 *
 * Flow:
 *  1. Website generates a random sessionId and shows a QR code:
 *     https://t.me/<BOT_USERNAME>?start=<sessionId>
 *  2. User scans → opens Telegram → sends /start <sessionId> to bot.
 *  3. Webhook records chatId ↔ sessionId association.
 *  4. User sends a photo in that chat.
 *  5. Webhook downloads the photo, stores base64 in the session.
 *  6. Website polls GET /api/telegram/poll?sessionId=xxx and receives the photo.
 *
 * Note: This is in-memory, single-instance only (fine for Cloud Run with 1 instance).
 * For a production multi-instance setup, use Redis or Firestore.
 */

export type TelegramSession = {
  sessionId: string;
  chatId?: number;
  /** base64-encoded JPEG photo (no data-url prefix) */
  photoB64?: string;
  createdAt: number;
};

const sessions = new Map<string, TelegramSession>();
const chatToSession = new Map<number, string>();

/** Max session lifetime: 30 minutes */
const SESSION_TTL_MS = 30 * 60 * 1000;

function gc() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
      if (s.chatId) chatToSession.delete(s.chatId);
    }
  }
}

/** Create or get a session. */
export function getOrCreateSession(sessionId: string): TelegramSession {
  gc();
  let session = sessions.get(sessionId);
  if (!session) {
    session = { sessionId, createdAt: Date.now() };
    sessions.set(sessionId, session);
  }
  return session;
}

/** Link a Telegram chatId to a sessionId (called when /start <sessionId> is received). */
export function linkChat(sessionId: string, chatId: number): TelegramSession | null {
  gc();
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.chatId = chatId;
  chatToSession.set(chatId, sessionId);
  return session;
}

/** Store a received photo for a chat (called when a photo message is received). */
export function storePhoto(chatId: number, photoB64: string): boolean {
  gc();
  const sessionId = chatToSession.get(chatId);
  if (!sessionId) return false;
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.photoB64 = photoB64;
  return true;
}

/** Poll for a photo by sessionId. Returns the base64 photo or null. */
export function pollPhoto(sessionId: string): string | null {
  gc();
  const session = sessions.get(sessionId);
  if (!session?.photoB64) return null;
  return session.photoB64;
}

/** Check if session exists and is linked to a Telegram chat. */
export function isSessionLinked(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  return !!session?.chatId;
}
