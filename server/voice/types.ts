/**
 * Provider-agnostic shapes for the voice assistant's tool-calling agent
 * loop (server/voice/agent.ts). Anthropic, OpenAI, and Gemini each have a
 * different wire format for messages/tools/tool-calls — every provider
 * adapter (server/voice/providers/*.ts) converts to and from THIS shape,
 * so the agent loop, the tool catalog, and the executor never need to
 * know which provider is active.
 */

export type CanonicalBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; toolName: string; content: string; isError?: boolean };

export interface CanonicalMessage {
  role: "user" | "assistant";
  content: CanonicalBlock[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ProviderTurnResult {
  content: CanonicalBlock[];
}

export interface AiProvider {
  id: "anthropic" | "openai" | "gemini";
  label: string;
  isConfigured: () => boolean;
  runTurn: (params: {
    system: string;
    tools: ToolDefinition[];
    messages: CanonicalMessage[];
  }) => Promise<ProviderTurnResult>;
}
