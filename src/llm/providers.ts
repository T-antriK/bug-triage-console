// ============================================================
// llm/providers.ts — request builders and response parsers, one pair
// per `shape` (anthropic | openai | gemini). Kimi is OpenAI-compatible
// and reuses that pair. client.ts picks the pair from the provider's
// `shape` field and never branches on the provider id itself.
// All endpoints, headers and models come from config.ts.
// ============================================================

import { LLM_CONFIG, LLM_PROVIDERS } from '../config';
import type { Provider, ProviderShape } from '../types';

export type ProviderId = Provider;

export function providerConfig(id: ProviderId) {
  return LLM_PROVIDERS[id];
}

export function isKeyRequired(id: ProviderId): boolean {
  return id !== 'none';
}

export type ChatRequest = {
  url: string;
  headers: Record<string, string>;
  body: string;
};

// ---- shared header assembly ----
function authHeaders(id: ProviderId, apiKey: string): Record<string, string> {
  const cfg = LLM_PROVIDERS[id];
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...cfg.extraHeaders,
  };
  if (cfg.keyHeader) {
    headers[cfg.keyHeader] =
      cfg.keyHeader === 'Authorization' ? `Bearer ${apiKey}` : apiKey;
  }
  return headers;
}

// ---- request builders, keyed by shape ----
type BuildFn = (
  id: ProviderId,
  apiKey: string,
  model: string,
  system: string,
  user: string,
) => ChatRequest;

const buildAnthropic: BuildFn = (id, apiKey, model, system, user) => ({
  url: LLM_PROVIDERS[id].endpoint as string,
  headers: authHeaders(id, apiKey),
  body: JSON.stringify({
    model,
    max_tokens: LLM_CONFIG.MAX_TOKENS,
    temperature: LLM_CONFIG.TEMPERATURE,
    system,
    messages: [{ role: 'user', content: user }],
  }),
});

const buildOpenAI: BuildFn = (id, apiKey, model, system, user) => ({
  url: LLM_PROVIDERS[id].endpoint as string,
  headers: authHeaders(id, apiKey),
  body: JSON.stringify({
    model,
    max_tokens: LLM_CONFIG.MAX_TOKENS,
    temperature: LLM_CONFIG.TEMPERATURE,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  }),
});

// Gemini: model goes in the URL path, system prompt is `systemInstruction`,
// the user turn is `contents`, and there is no `messages`/`max_tokens`.
const buildGemini: BuildFn = (id, apiKey, model, system, user) => ({
  url: (LLM_PROVIDERS[id].endpoint as string).replace('{model}', encodeURIComponent(model)),
  headers: authHeaders(id, apiKey),
  body: JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature: LLM_CONFIG.TEMPERATURE,
      maxOutputTokens: LLM_CONFIG.MAX_TOKENS,
    },
  }),
});

const BUILDERS: Record<Exclude<ProviderShape, 'none'>, BuildFn> = {
  anthropic: buildAnthropic,
  openai: buildOpenAI,
  gemini: buildGemini,
};

export function buildRequest(
  id: ProviderId,
  apiKey: string,
  model: string,
  system: string,
  user: string,
): ChatRequest | null {
  const shape = LLM_PROVIDERS[id].shape;
  if (shape === 'none') return null;
  return BUILDERS[shape](id, apiKey, model, system, user);
}

// ---- response parsers, keyed by shape ----
type ParseFn = (json: unknown) => string | null;

const parseAnthropic: ParseFn = (json) => {
  const content = (json as { content?: Array<{ type: string; text?: string }> }).content;
  return content?.find((c) => c.type === 'text')?.text ?? null;
};

const parseOpenAI: ParseFn = (json) => {
  const choices = (json as { choices?: Array<{ message?: { content?: string } }> }).choices;
  return choices?.[0]?.message?.content ?? null;
};

const parseGemini: ParseFn = (json) => {
  const candidates = (json as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  }).candidates;
  return candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') || null;
};

const PARSERS: Record<Exclude<ProviderShape, 'none'>, ParseFn> = {
  anthropic: parseAnthropic,
  openai: parseOpenAI,
  gemini: parseGemini,
};

export function extractText(id: ProviderId, json: unknown): string | null {
  try {
    const shape = LLM_PROVIDERS[id].shape;
    if (shape === 'none') return null;
    return PARSERS[shape](json);
  } catch {
    return null;
  }
}
