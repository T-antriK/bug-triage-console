// ============================================================
// llm/parse.ts — strict JSON parse + validation.
// Strips fences defensively, parses, validates every enum against the
// config arrays, and DROPS any field that fails rather than throwing.
// A malformed response degrades to rules-only for that report (the
// caller sees ok:false with a failure reason), never an error screen.
// ============================================================

import {
  BUCKET_IDS,
  LLM_FAILURES,
} from '../config';
import type { ClassificationPass, EvidenceSpan, Signals } from '../types';
import { SIGNAL_DEFAULTS } from '../rules/signals';
import { SECONDARY_TAGS } from '../rules/secondaryTags';

export type ParseResult =
  | { ok: true; pass: ClassificationPass }
  | { ok: false; failure: string };

function stripFences(raw: string): string {
  let s = raw.trim();
  // ```json ... ``` or ``` ... ```
  const fence = /^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/;
  const m = s.match(fence);
  if (m) s = m[1].trim();
  // sometimes a leading label like "JSON:" sneaks in
  const brace = s.indexOf('{');
  const lastBrace = s.lastIndexOf('}');
  if (brace > 0 && lastBrace > brace) s = s.slice(brace, lastBrace + 1);
  return s;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

const FUNCTIONAL = ['broken', 'degraded', 'cosmetic'] as const;
const INTEGRITY = ['clean', 'at_risk', 'lost'] as const;
const EXPOSURE = ['none', 'customer_harm', 'legal'] as const;

function validateSignals(raw: unknown): Signals {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    functional_loss: oneOf(r.functional_loss, FUNCTIONAL) ?? SIGNAL_DEFAULTS.functional_loss,
    data_integrity: oneOf(r.data_integrity, INTEGRITY) ?? SIGNAL_DEFAULTS.data_integrity,
    data_loss_ongoing: asBool(r.data_loss_ongoing, SIGNAL_DEFAULTS.data_loss_ongoing),
    exposure: oneOf(r.exposure, EXPOSURE) ?? SIGNAL_DEFAULTS.exposure,
    exposure_prompt_level: asBool(
      r.exposure_prompt_level,
      SIGNAL_DEFAULTS.exposure_prompt_level,
    ),
    silent_failure: asBool(r.silent_failure, SIGNAL_DEFAULTS.silent_failure),
    outage_language: asBool(r.outage_language, SIGNAL_DEFAULTS.outage_language),
  };
}

function validateEvidence(raw: unknown): EvidenceSpan[] {
  if (!Array.isArray(raw)) return [];
  const out: EvidenceSpan[] = [];
  for (const item of raw) {
    const rec = item as Record<string, unknown>;
    const text = typeof rec.text === 'string' ? rec.text : null;
    if (!text) continue;
    const supports =
      typeof rec.supports === 'string' && rec.supports.length > 0
        ? (rec.supports as EvidenceSpan['supports'])
        : 'bucket';
    // start/end are recomputed against the real text by the pipeline's
    // substring guard, so placeholder zeros here are fine.
    out.push({ field: 'bug_report', text, start: 0, end: text.length, supports });
  }
  return out;
}

function validateTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set<string>(SECONDARY_TAGS);
  return raw.filter((t): t is string => typeof t === 'string' && known.has(t));
}

export function parseLlmResponse(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return { ok: false, failure: LLM_FAILURES.BAD_JSON };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, failure: LLM_FAILURES.BAD_SHAPE };
  }

  const obj = parsed as Record<string, unknown>;
  const bucket = oneOf(obj.bucket, BUCKET_IDS);
  // A missing/invalid bucket is allowed — the model abstains, rules lead.
  const signals = validateSignals(obj.signals);

  const pass: ClassificationPass = {
    bucket: bucket,
    bucketScores: { STT: 0, TTS: 0, LLM: 0, POST_CALL: 0, INFRA: 0 },
    topScore: 0,
    signals,
    secondary_tags: validateTags(obj.secondary_tags),
    evidence: validateEvidence(obj.evidence),
    rationale: typeof obj.rationale === 'string' ? obj.rationale : null,
  };

  return { ok: true, pass };
}
