import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider, CanonicalBlock, CanonicalMessage, ToolDefinition } from "../types.ts";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

function toAnthropicMessages(messages: CanonicalMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content.map((b): Anthropic.ContentBlockParam => {
      if (b.type === "text") return { type: "text", text: b.text };
      if (b.type === "tool_use") return { type: "tool_use", id: b.id, name: b.name, input: b.input };
      return { type: "tool_result", tool_use_id: b.toolUseId, content: b.content, is_error: b.isError };
    }),
  }));
}

function fromAnthropicContent(content: Anthropic.ContentBlock[]): CanonicalBlock[] {
  const blocks: CanonicalBlock[] = [];
  for (const block of content) {
    if (block.type === "text") blocks.push({ type: "text", text: block.text });
    else if (block.type === "tool_use") {
      blocks.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
    }
  }
  return blocks;
}

function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Tool.InputSchema,
  }));
}

export const anthropicProvider: AiProvider = {
  id: "anthropic",
  label: "Claude (Anthropic)",
  isConfigured: () => !!process.env.ANTHROPIC_API_KEY,
  runTurn: async ({ system, tools, messages }) => {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: toAnthropicTools(tools),
      messages: toAnthropicMessages(messages),
    });
    return { content: fromAnthropicContent(response.content) };
  },
};
