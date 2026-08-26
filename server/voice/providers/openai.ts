import OpenAI from "openai";
import type { AiProvider, CanonicalBlock, CanonicalMessage, ToolDefinition } from "../types.ts";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-5-mini";

/** OpenAI's chat format is flat (no nested content-block arrays like
 * Anthropic/Gemini) and tool results are their own "tool"-role messages
 * rather than bundled into a turn — this expands each canonical message
 * into one or more OpenAI messages accordingly. */
function toOpenAiMessages(
  system: string,
  messages: CanonicalMessage[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: "system", content: system }];

  for (const m of messages) {
    if (m.role === "assistant") {
      const text = m.content
        .filter((b): b is Extract<CanonicalBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const toolUses = m.content.filter(
        (b): b is Extract<CanonicalBlock, { type: "tool_use" }> => b.type === "tool_use",
      );
      out.push({
        role: "assistant",
        content: text || null,
        ...(toolUses.length > 0
          ? {
              tool_calls: toolUses.map((tu) => ({
                id: tu.id,
                type: "function" as const,
                function: { name: tu.name, arguments: JSON.stringify(tu.input) },
              })),
            }
          : {}),
      });
    } else {
      const toolResults = m.content.filter(
        (b): b is Extract<CanonicalBlock, { type: "tool_result" }> => b.type === "tool_result",
      );
      for (const tr of toolResults) {
        out.push({ role: "tool", tool_call_id: tr.toolUseId, content: tr.content });
      }
      const text = m.content
        .filter((b): b is Extract<CanonicalBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      if (text) out.push({ role: "user", content: text });
    }
  }
  return out;
}

function fromOpenAiMessage(message: OpenAI.Chat.ChatCompletionMessage): CanonicalBlock[] {
  const blocks: CanonicalBlock[] = [];
  if (message.content) blocks.push({ type: "text", text: message.content });
  for (const tc of message.tool_calls ?? []) {
    if (tc.type !== "function") continue;
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(tc.function.arguments || "{}");
    } catch {
      // Model returned malformed JSON args — leave input empty; the executor
      // will surface a clear error the model can recover from next turn.
    }
    blocks.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
  }
  return blocks;
}

function toOpenAiTools(tools: ToolDefinition[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters as Record<string, unknown> },
  }));
}

export const openaiProvider: AiProvider = {
  id: "openai",
  label: "ChatGPT (OpenAI)",
  isConfigured: () => !!process.env.OPENAI_API_KEY,
  runTurn: async ({ system, tools, messages }) => {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: toOpenAiMessages(system, messages),
      tools: toOpenAiTools(tools),
      tool_choice: "auto",
    });
    return { content: fromOpenAiMessage(response.choices[0].message) };
  },
};
