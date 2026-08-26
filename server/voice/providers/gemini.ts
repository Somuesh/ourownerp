import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AiProvider, CanonicalBlock, CanonicalMessage, ToolDefinition } from "../types.ts";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-1.5-pro";

// Gemini's function-calling parts carry no call id (unlike Anthropic/OpenAI) —
// it matches function responses to calls by name/position within a turn, not
// by id. Canonical blocks still carry a synthetic id (generated here) purely
// for our own bookkeeping in the agent loop; it's never sent to Gemini.
let syntheticIdCounter = 0;

function toGeminiTools(tools: ToolDefinition[]) {
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters as unknown as object,
      })),
    },
  ];
}

function toGeminiContents(messages: CanonicalMessage[]) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: m.content.map((b: CanonicalBlock) => {
      if (b.type === "text") return { text: b.text };
      if (b.type === "tool_use") return { functionCall: { name: b.name, args: b.input } };
      let parsed: object;
      try {
        parsed = JSON.parse(b.content);
      } catch {
        parsed = { result: b.content };
      }
      return { functionResponse: { name: b.toolName, response: parsed } };
    }),
  }));
}

function fromGeminiParts(parts: Array<{ text?: string; functionCall?: { name: string; args?: object } }>): CanonicalBlock[] {
  const blocks: CanonicalBlock[] = [];
  for (const part of parts) {
    if (part.text) blocks.push({ type: "text", text: part.text });
    if (part.functionCall) {
      blocks.push({
        type: "tool_use",
        id: `gemini-${Date.now()}-${syntheticIdCounter++}`,
        name: part.functionCall.name,
        input: (part.functionCall.args as Record<string, unknown>) ?? {},
      });
    }
  }
  return blocks;
}

export const geminiProvider: AiProvider = {
  id: "gemini",
  label: "Gemini (Google)",
  isConfigured: () => !!process.env.GEMINI_API_KEY,
  runTurn: async ({ system, tools, messages }) => {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: MODEL,
      tools: toGeminiTools(tools),
      systemInstruction: system,
    });
    const result = await model.generateContent({ contents: toGeminiContents(messages) });
    const parts = result.response.candidates?.[0]?.content?.parts ?? [];
    return { content: fromGeminiParts(parts as any) };
  },
};
