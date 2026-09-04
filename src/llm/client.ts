// ============================================================
// llm/client.ts — provider-agnostic fetch wrapper.
// One call per submit. Timeout, one retry, and a hard rule: every
// failure path (timeout, network, 401, 429, bad JSON) returns
// ok:false with a named reason. The pipeline then runs rules-only.
// Calls go direct from the browser to the provider.
//
// Verbose mode: pass { capture: true } to also attach a `debug` object
// (latency, HTTP status, raw response body truncated, which parsed
// fields survived). The debug object NEVER contains the API key — only
// the response body and status, never the request headers.
// ============================================================

import { FEATURES, LLM_CONFIG, LLM_FAILURES, TRACE } from '../config';
import type { LlmCallDebug, LlmOutcome, Settings, TriageInput } from '../types';
import { buildRequest, extractText, providerConfig } from './providers';
import { SYSTEM_PROMPT, buildUserMessage } from './prompt';
import { parseLlmResponse } from './parse';

function httpFailureReason(status: number): string {
  if (status === 401 || status === 403) return LLM_FAILURES.AUTH;
  if (status === 429) return LLM_FAILURES.RATE_LIMIT;
  return LLM_FAILURES.NETWORK;
}

function truncate(s: string): string {
  return s.length > TRACE.RAW_BODY_MAX_CHARS ? s.slice(0, TRACE.RAW_BODY_MAX_CHARS) + '…' : s;
}

type Once = LlmOutcome;

async function once(
  settings: Settings,
  model: string,
  input: TriageInput,
  capture: boolean,
): Promise<Once> {
  const req = buildRequest(
    settings.provider,
    settings.apiKey,
    model,
    SYSTEM_PROMPT,
    buildUserMessage(input),
  );
  if (!req) return { ok: false, failure: LLM_FAILURES.DISABLED };

  const controller = new AbortController();
  const cfg = providerConfig(settings.provider);
  const timeoutMs = (cfg as { timeoutMs?: number }).timeoutMs ?? LLM_CONFIG.TIMEOUT_MS;
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  // Assembled only when capture is on.
  const mkDebug = (over: Partial<LlmCallDebug>): LlmCallDebug => ({
    provider: settings.provider,
    model,
    endpoint: req.url,
    latency_ms: Date.now() - started,
    http_status: null,
    raw_body: '',
    fields_kept: [],
    fields_dropped: [],
    failure: null,
    ...over,
  });

  try {
    const res = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: req.body,
      signal: controller.signal,
    });
    const rawBody = await res.text();

    if (!res.ok) {
      const failure = httpFailureReason(res.status);
      return {
        ok: false,
        failure,
        ...(capture
          ? { debug: mkDebug({ http_status: res.status, raw_body: truncate(rawBody), failure }) }
          : {}),
      };
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return {
        ok: false,
        failure: LLM_FAILURES.BAD_SHAPE,
        ...(capture
          ? {
              debug: mkDebug({
                http_status: res.status,
                raw_body: truncate(rawBody),
                failure: LLM_FAILURES.BAD_SHAPE,
              }),
            }
          : {}),
      };
    }

    const text = extractText(settings.provider, json);
    if (!text) {
      return {
        ok: false,
        failure: LLM_FAILURES.BAD_SHAPE,
        ...(capture
          ? {
              debug: mkDebug({
                http_status: res.status,
                raw_body: truncate(rawBody),
                failure: LLM_FAILURES.BAD_SHAPE,
              }),
            }
          : {}),
      };
    }

    const parsed = parseLlmResponse(text);
    if (!parsed.ok) {
      return {
        ok: false,
        failure: parsed.failure,
        ...(capture
          ? {
              debug: mkDebug({
                http_status: res.status,
                raw_body: truncate(rawBody),
                failure: parsed.failure,
              }),
            }
          : {}),
      };
    }

    return {
      ok: true,
      pass: parsed.pass,
      ...(capture
        ? {
            debug: mkDebug({
              http_status: res.status,
              raw_body: truncate(rawBody),
              fields_kept: parsed.kept,
              fields_dropped: parsed.dropped,
              failure: null,
            }),
          }
        : {}),
    };
  } catch (err) {
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    const failure = isAbort ? LLM_FAILURES.TIMEOUT : LLM_FAILURES.CORS;
    // The fetch threw before any HTTP response — a CORS rejection, a
    // blocked cross-origin request, or the host being unreachable. A
    // browser cannot tell these apart. Fall back to rules-only.
    return {
      ok: false,
      failure,
      ...(capture ? { debug: mkDebug({ http_status: null, raw_body: '', failure }) } : {}),
    };
  } finally {
    window.clearTimeout(timer);
  }
}

/** The one entry point. Never throws. */
export async function callLlm(
  settings: Settings,
  input: TriageInput,
  opts: { capture?: boolean } = {},
): Promise<LlmOutcome> {
  const capture = !!opts.capture;
  if (!FEATURES.LLM_ENABLED) return { ok: false, failure: LLM_FAILURES.DISABLED };
  if (settings.provider === 'none') return { ok: false, failure: LLM_FAILURES.DISABLED };
  if (!settings.apiKey.trim()) return { ok: false, failure: LLM_FAILURES.NO_KEY };

  const model = settings.model ?? providerConfig(settings.provider).defaultModel ?? '';

  let last: LlmOutcome = { ok: false, failure: LLM_FAILURES.NETWORK };
  for (let attempt = 0; attempt <= LLM_CONFIG.MAX_RETRIES; attempt++) {
    last = await once(settings, model, input, capture);
    if (last.ok) return last;
    // Only retry genuinely transient classes. A CORS block will not clear
    // on a retry, so it fails fast.
    if (last.failure !== LLM_FAILURES.NETWORK && last.failure !== LLM_FAILURES.TIMEOUT) {
      return last;
    }
  }
  return last;
}
