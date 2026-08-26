import type { AiProvider } from "../types.ts";
import { anthropicProvider } from "./anthropic.ts";
import { geminiProvider } from "./gemini.ts";
import { openaiProvider } from "./openai.ts";

export const PROVIDERS: AiProvider[] = [anthropicProvider, openaiProvider, geminiProvider];

export function getProvider(id: string): AiProvider {
  const provider = PROVIDERS.find((p) => p.id === id);
  if (!provider) throw new Error(`Unknown AI provider "${id}"`);
  return provider;
}

/** What the voice assistant's provider picker shows — only ones with an
 * API key actually set in .env. */
export function listConfiguredProviders() {
  return PROVIDERS.filter((p) => p.isConfigured()).map((p) => ({ id: p.id, label: p.label }));
}
