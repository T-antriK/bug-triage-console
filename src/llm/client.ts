// ============================================================
// llm/client.ts — provider-agnostic fetch wrapper.
// One call per submit. Timeout, one retry, and a hard rule: every
// failure path (timeout, network, 401, 429, bad JSON) returns
// ok:false with a named reason. The pipeline then runs rules-only.
// Calls go direct from the browser to the provider.
// ============================================================

import { FEATURES, LLM_CONFIG, LLM_FAILURES } from '../config';
import type { LlmOutcome, Settings, TriageInput } from '../types';
import { buildRequest, extractText, providerConfig } from './providers';
import { SYSTEM_PROMPT, buildUserMessage } from './prompt';
import { parseLlmResponse } from './parse';

function httpFailureReason(status: number): string {
  if (status === 401 || status === 403) return LLM_FAILURES.AUTH;
  if (status === 429) return LLM_FAILURES.RATE_LIMIT;
  return LLM_FAILURES.NETWORK;
}

async function once(
  settings: Settings,
  model: string,
  input: TriageInput,
): Promise<LlmOutcome> {
  const req = buildRequest(
    settings.provider,
    settings.apiKey,
    model,
    SYSTEM_PROMPT,
    buildUserMessage(input),
  );
  if (!req) return { ok: false, failure: LLM_FAILURES.DISABLED };

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), LLM_CONFIG.TIMEOUT_MS);

  try {
    const res = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: req.body,
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, failure: httpFailureReason(res.status) };
    }
    const json = (await res.json()) as unknown;
    const text = extractText(settings.provider, json);
    if (!text) return { ok: false, failure: LLM_FAILURES.BAD_SHAPE };

    const parsed = parseLlmResponse(text);
    if (!parsed.ok) return { ok: false, failure: parsed.failure };
    return { ok: true, pass: parsed.pass };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, failure: LLM_FAILURES.TIMEOUT };
    }
    // The fetch threw before any HTTP response came back — a CORS
    // rejection, a blocked cross-origin request, or the host being
    // unreachable. A browser cannot tell these apart (all surface as
    // `TypeError: Failed to fetch`). The spec groups "CORS or network
    // error" into one path: fall back to rules-only and tell the user the
    // provider may need a server proxy.
    return { ok: false, failure: LLM_FAILURES.CORS };
  } finally {
    window.clearTimeout(timer);
  }
}

/** The one entry point. Never throws. */
export async function callLlm(
  settings: Settings,
  input: TriageInput,
): Promise<LlmOutcome> {
  if (!FEATURES.LLM_ENABLED) return { ok: false, failure: LLM_FAILURES.DISABLED };
  if (settings.provider === 'none') return { ok: false, failure: LLM_FAILURES.DISABLED };
  if (!settings.apiKey.trim()) return { ok: false, failure: LLM_FAILURES.NO_KEY };

  const model = settings.model ?? providerConfig(settings.provider).defaultModel ?? '';

  let last: LlmOutcome = { ok: false, failure: LLM_FAILURES.NETWORK };
  for (let attempt = 0; attempt <= LLM_CONFIG.MAX_RETRIES; attempt++) {
    last = await once(settings, model, input);
    if (last.ok) return last;
    // Only retry genuinely transient classes. A CORS block will not clear
    // on a retry, so it fails fast.
    if (last.failure !== LLM_FAILURES.NETWORK && last.failure !== LLM_FAILURES.TIMEOUT) {
      return last;
    }
  }
  return last;
}
