import type { AuthUser } from "../auth.ts";
import { executeTool } from "./executor.ts";
import { getProvider } from "./providers/index.ts";
import { VOICE_TOOLS } from "./tools.ts";
import type { CanonicalBlock, CanonicalMessage } from "./types.ts";

const MAX_ITERATIONS = 6;

function systemPrompt(user: AuthUser, language?: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const languageInstruction = language
    ? `\n- The user is speaking ${language}. Always reply in ${language}, in natural, conversational ${language} — not a literal word-for-word translation of English phrasing. This applies no matter what language these instructions are written in.`
    : "";
  return `You are the voice assistant for "Our ERP", a business management system. You are speaking with ${user.name ?? user.email ?? "a user"} (role: ${user.role}). Today's date is ${today}.

You can read and create/update records across CRM, Sales, Purchasing, Inventory (including warehouses and stock transfers), HR (employees, departments, leave, attendance), Point of Sale (sessions and quick sales), and Invoicing using the tools available to you.

Rules:
- Keep every reply SHORT and conversational — it will be read aloud via text-to-speech. No markdown, no bullet lists, no headings, no asterisks.
- Ask only ONE clarifying question at a time if required information is missing, and only for information that's actually required — don't ask about optional fields the user didn't mention.
- Before using an ID (companyId, contactId, productId, warehouseId, employeeId, departmentId, leaveTypeId, leaveRequestId, stageId, salesOrderId, purchaseOrderId, invoiceId, vendorBillId), resolve it with the matching search/list tool if the user referred to it by name or number rather than a raw ID. Never invent an ID.
- HARD RULE — never skip this: for ANY company, contact, or product the user refers to by name, you MUST call search_companies / search_contacts / search_products with that name BEFORE deciding whether to create a new one or use an existing one. This applies even if you are fairly confident it already exists, and even if you are fairly confident it doesn't. Never call create_company, create_contact, or create_product without a matching search call earlier in this same conversation.
- Speech-to-text is often imperfect, especially when the user mixes languages in one sentence (e.g. speaking Hindi but saying a product/company name in English) — a name may be mistranscribed. If a search for a name returns no results, do NOT assume the record doesn't exist. First try searching again with the closest plausible variation you can think of (different spelling, only part of the name, a phonetically similar word). Only if that still finds nothing should you tell the user you couldn't find a match and ask whether to create a new record or whether they meant something else — never create automatically just because a search came back empty.- When delivering a sales order or receiving a purchase order and more than one warehouse exists (check list_warehouses), ask which warehouse unless the user already said. For HR, search_employees before create_employee to avoid duplicates; resolve relative dates like "tomorrow" or "next Monday" to YYYY-MM-DD yourself using today's date.
- Before calling a tool that creates or changes a business record, briefly restate what you're about to do in one short sentence and ask "Should I go ahead?" — unless the user has already clearly confirmed in their message (e.g. "yes", "do it", "go ahead", "confirmed").
- After a tool call succeeds, tell the user what happened in one short sentence.
- If a tool call fails, briefly explain the error in plain language and ask how they'd like to proceed — don't retry blindly.${languageInstruction}`;
}

export interface ToolCallRecord {
  name: string;
  input: Record<string, unknown>;
  result: unknown;
  isError: boolean;
}

/** Runs one user turn through the tool-calling agent loop: sends the
 * conversation to whichever provider is selected, executes any tool calls
 * against our own API (see executor.ts), feeds the results back, and
 * repeats until the model responds with plain text (a question or a
 * completion summary) rather than another tool call. Mutates `session` in
 * place so the caller's stored history stays in sync. Every tool call made
 * along the way is returned in `toolCalls` so the caller can log it (see
 * server/routes/voice.ts) — each one already produced its own audit_log
 * row via the real REST endpoint it hit; this is just the record of what
 * happened during THIS spoken exchange, for the voice activity chatter. */
export async function runAgentTurn(params: {
  providerId: string;
  session: CanonicalMessage[];
  authHeader: string;
  user: AuthUser;
  language?: string;
}): Promise<{ reply: string; resultPath?: string; toolCalls: ToolCallRecord[] }> {
  const provider = getProvider(params.providerId);
  if (!provider.isConfigured()) {
    throw new Error(`${provider.label} isn't configured on the server yet.`);
  }

  let resultPath: string | undefined;
  const toolCallLog: ToolCallRecord[] = [];
  const ctx = {
    authHeader: params.authHeader,
    setResultPath: (path: string) => {
      resultPath = path;
    },
  };

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const { content } = await provider.runTurn({
      system: systemPrompt(params.user, params.language),
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
      return { reply: reply || "Okay.", resultPath, toolCalls: toolCallLog };
    }

    const resultBlocks: CanonicalBlock[] = [];
    for (const toolUse of toolUses) {
      const result = await executeTool(toolUse.name, toolUse.input, ctx);
      const isError = typeof result === "object" && result !== null && "error" in result;
      toolCallLog.push({ name: toolUse.name, input: toolUse.input, result, isError });
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
    toolCalls: toolCallLog,
  };
}
