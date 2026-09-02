import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import { AppError, asyncHandler, getCurrentUser, requireAdmin } from "../auth.ts";
import { db } from "../db/client.ts";
import { users, voiceCommandLogs } from "../db/schema.ts";
import { runAgentTurn } from "../voice/agent.ts";
import { listConfiguredProviders } from "../voice/providers/index.ts";
import { getSession, resetSession } from "../voice/session.ts";

const router = Router();

/** Which AI providers the voice assistant's picker should offer — only
 * ones with an API key actually configured in .env. */
router.get(
  "/voice/providers",
  asyncHandler(async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) throw new AppError(401, "User not logged in");
    res.json(listConfiguredProviders());
  }),
);

router.post(
  "/voice/command",
  asyncHandler(async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) throw new AppError(401, "User not logged in");
    if (user.role === "client") {
      throw new AppError(403, "The voice assistant isn't available on client portal accounts");
    }

    const { sessionId, transcript, providerId, language } = req.body as {
      sessionId: string;
      transcript: string;
      providerId: string;
      language?: string;
    };
    if (!sessionId || !transcript || !providerId) {
      throw new AppError(400, "sessionId, transcript, and providerId are required");
    }

    const session = getSession(sessionId);
    session.messages.push({ role: "user", content: [{ type: "text", text: transcript }] });

    let reply: string;
    let resultPath: string | undefined;
    let toolCalls: Awaited<ReturnType<typeof runAgentTurn>>["toolCalls"] = [];
    try {
      const result = await runAgentTurn({
        providerId,
        session: session.messages,
        authHeader: req.headers.authorization!,
        user,
        language,
      });
      reply = result.reply;
      resultPath = result.resultPath;
      toolCalls = result.toolCalls;
    } catch (error) {
      reply = error instanceof Error ? error.message : "Voice assistant error";
      // Still logged below (as a turn with no successful tool calls) so
      // failures show up in the activity chatter too, not just successes.
    }

    // Best-effort — a logging hiccup should never break the actual voice
    // interaction the user is waiting on.
    if (toolCalls.length > 0) {
      try {
        await db.insert(voiceCommandLogs).values({
          sessionId,
          userId: user._id,
          language: language ?? null,
          userTranscript: transcript,
          assistantReply: reply,
          toolCalls,
        });
      } catch (error) {
        console.error("Failed to write voice command log:", error);
      }
    }

    res.json({ reply, resultPath });
  }),
);

/** Starts a fresh conversation — call this when the user opens a brand
 * new command after a previous one finished, so old context doesn't leak
 * into an unrelated request. */
router.post(
  "/voice/reset",
  asyncHandler(async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) throw new AppError(401, "User not logged in");
    const { sessionId } = req.body as { sessionId: string };
    if (sessionId) resetSession(sessionId);
    res.json(null);
  }),
);

/** The "chatter" feed — every turn anyone has had with the voice
 * assistant, most recent first, with what changed as a result. Admin-only:
 * this surfaces other people's literal spoken words, which is more
 * personal than ordinary business records. */
router.get(
  "/voice/logs",
  asyncHandler(async (req, res) => {
    await requireAdmin(req);
    const rows = await db
      .select({ log: voiceCommandLogs, userName: users.name, userEmail: users.email })
      .from(voiceCommandLogs)
      .innerJoin(users, eq(users.id, voiceCommandLogs.userId))
      .orderBy(desc(voiceCommandLogs.createdAt))
      .limit(200);

    res.json(
      rows.map((r) => ({
        _id: r.log.id,
        sessionId: r.log.sessionId,
        userName: r.userName ?? r.userEmail ?? "Someone",
        language: r.log.language,
        userTranscript: r.log.userTranscript,
        assistantReply: r.log.assistantReply,
        toolCalls: r.log.toolCalls,
        createdAtIso: r.log.createdAt.toISOString(),
      })),
    );
  }),
);

export default router;
