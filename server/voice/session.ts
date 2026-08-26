import type { CanonicalMessage } from "./types.ts";

interface VoiceSession {
  messages: CanonicalMessage[];
  lastActive: number;
}

/** In-memory only — voice conversations are short-lived (a command plus a
 * clarifying exchange or two), so there's no need for a database table.
 * Sessions older than TTL_MS are swept periodically so this can't grow
 * unbounded across a long-running server process. */
const sessions = new Map<string, VoiceSession>();
const TTL_MS = 20 * 60 * 1000;

setInterval(
  () => {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.lastActive > TTL_MS) sessions.delete(id);
    }
  },
  5 * 60 * 1000,
).unref();

export function getSession(sessionId: string): VoiceSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = { messages: [], lastActive: Date.now() };
    sessions.set(sessionId, session);
  }
  session.lastActive = Date.now();
  return session;
}

export function resetSession(sessionId: string): void {
  sessions.delete(sessionId);
}
