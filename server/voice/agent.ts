import type { AuthUser } from "../auth.ts";
import { executeTool } from "./executor.ts";
import { getProvider } from "./providers/index.ts";
import { VOICE_TOOLS } from "./tools.ts";
import type { CanonicalBlock, CanonicalMessage } from "./types.ts";

const MAX_ITERATIONS = 6;

function systemPrompt(user: AuthUser): string {
  const today = new Date().toISOString().slice(0, 10);
  return `You are the voice assistant for "Our ERP", a business management system. You are speaking with ${user.name ?? user.email ?? "a user"} (role: ${user.role}). Today's date is ${today}.

You can read and create/update records across CRM, Sales, Purchasing, Inventory, and Invoicing using the tools available to you.

Rules:
- Keep every reply SHORT and conversational — it will be read aloud via text-to-speech. No markdown, no bullet lists, no headings, no asterisks.
- Ask only ONE clarifying question at a time if required information is missing, and only for information that's actually required — don't ask about optional fields the user didn't mention.
- Before using an ID (companyId, contactId, productId, stageId, salesOrderId, purchaseOrderId, invoiceId, vendorBillId), resolve it with the matching search/list tool if the user referred to it by name or number rather than a raw ID. Never invent an ID.
- If a search returns no match or several ambiguous matches, ask the user to clarify — or for companies/contacts/products specifically, offer to create a new one.
- Before calling a tool that creates or changes a business record, briefly restate what you're about to do in one short sentence and ask "Should I go ahead?" — unless the user has already clearly confirmed in their message (e.g. "yes", "do it", "go ahead", "confirmed").
- After a tool call succeeds, tell the user what happened in one short sentence.
- If a tool call fails, briefly explain the error in plain language and ask how they'd like to proceed — don't retry blindly.`;
}

/** Runs one user turn through the tool-calling agent loop: sends the
 * conversation to whichever provider is selected, executes any tool calls
 * against our own API (see executor.ts), feeds the results back, and
 * repeats until the model responds with plain text (a question or a
 * completion summary) rather than another tool call. Mutates `session` in
 * place so the caller's stored history stays in sync. */
export async function runAgentTurn(params: {
  providerId: string;
  session: CanonicalMessage[];
  authHeader: string;
  user: AuthUser;
}): Promise<{ reply: string; resultPath?: string }> {
  const provider = getProvider(params.providerId);
  if (!provider.isConfigured()) {
    throw new Error(`${provider.label} isn't configured on the server yet.`);
  }

  let resultPath: string | undefined;
  const ctx = {
    authHeader: params.authHeader,
    setResultPath: (path: string) => {
      resultPath = path;
    },
  };

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const { content } = await provider.runTurn({
      system: systemPrompt(params.user),
      tools: VOICE_TOOLS,
      messages: params.session,
    });
    params.session.push({ role: "assistant", content });

    const toolUses = content.filter(
      (b): b is Extract<CanonicalBlock, { type: "tool_use" }> => b.type === "tool_use",
    );
    if (toolUses.length === 0) {
      const reply = content
        .filter((b): b is Extract<CanonicalBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join(" ")
        .trim();
      return { reply: reply || "Okay.", resultPath };
    }

    const resultBlocks: CanonicalBlock[] = [];
    for (const toolUse of toolUses) {
      const result = await executeTool(toolUse.name, toolUse.input, ctx);
      const isError = typeof result === "object" && result !== null && "error" in result;
      resultBlocks.push({
        type: "tool_result",
        toolUseId: toolUse.id,
        toolName: toolUse.name,
        content: JSON.stringify(result),
        isError,
      });
    }
    params.session.push({ role: "user", content: resultBlocks });
  }

  return {
    reply: "This is taking more steps than I expected — could you try rephrasing your request?",
  };
}
