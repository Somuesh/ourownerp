import { Router } from "express";
import { AppError, asyncHandler, getCurrentUser } from "../auth.ts";
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

    const { sessionId, transcript, providerId } = req.body as {
      sessionId: string;
      transcript: string;
      providerId: string;
    };
    if (!sessionId || !transcript || !providerId) {
      throw new AppError(400, "sessionId, transcript, and providerId are required");
    }

    const session = getSession(sessionId);
    session.messages.push({ role: "user", content: [{ type: "text", text: transcript }] });

    try {
      const { reply, resultPath } = await runAgentTurn({
        providerId,
        session: session.messages,
        authHeader: req.headers.authorization!,
        user,
      });
      res.json({ reply, resultPath });
    } catch (error) {
      throw new AppError(500, error instanceof Error ? error.message : "Voice assistant error");
    }
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

export default router;
