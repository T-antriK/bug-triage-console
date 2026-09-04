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

export type FieldDrop = { field: string; reason: string };

export type ParseResult =
  | { ok: true; pass: ClassificationPass; kept: string[]; dropped: FieldDrop[] }
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

const FUNCTIONAL = ['broken', 'degraded', 'cosmetic'] as const;
const INTEGRITY = ['clean', 'at_risk', 'lost'] as const;
const EXPOSURE = ['none', 'customer_harm', 'legal'] as const;

function validateSignals(raw: unknown, drops: FieldDrop[], kept: string[]): Signals {
  const r = (raw ?? {}) as Record<string, unknown>;
  const enumField = <T extends string>(
    name: keyof Signals,
    allowed: readonly T[],
    fallback: T,
  ): T => {
    const v = oneOf(r[name as string], allowed);
    if (v === null) {
      if (r[name as string] !== undefined) {
        drops.push({ field: `signals.${String(name)}`, reason: `not one of ${allowed.join('|')}` });
      } else {
        drops.push({ field: `signals.${String(name)}`, reason: 'missing, used default' });
      }
      return fallback;
    }
    kept.push(`signals.${String(name)}`);
    return v;
  };
  const boolField = (name: keyof Signals, fallback: boolean): boolean => {
    if (typeof r[name as string] === 'boolean') {
      kept.push(`signals.${String(name)}`);
      return r[name as string] as boolean;
    }
    drops.push({
      field: `signals.${String(name)}`,
      reason: r[name as string] === undefined ? 'missing, used default' : 'not a boolean',
    });
    return fallback;
  };
  return {
    functional_loss: enumField('functional_loss', FUNCTIONAL, SIGNAL_DEFAULTS.functional_loss),
    data_integrity: enumField('data_integrity', INTEGRITY, SIGNAL_DEFAULTS.data_integrity),
    data_loss_ongoing: boolField('data_loss_ongoing', SIGNAL_DEFAULTS.data_loss_ongoing),
    exposure: enumField('exposure', EXPOSURE, SIGNAL_DEFAULTS.exposure),
    exposure_prompt_level: boolField('exposure_prompt_level', SIGNAL_DEFAULTS.exposure_prompt_level),
    silent_failure: boolField('silent_failure', SIGNAL_DEFAULTS.silent_failure),
    outage_language: boolField('outage_language', SIGNAL_DEFAULTS.outage_language),
  };
}

function validateEvidence(raw: unknown, drops: FieldDrop[]): EvidenceSpan[] {
  if (!Array.isArray(raw)) {
    if (raw !== undefined) drops.push({ field: 'evidence', reason: 'not an array' });
    return [];
  }
  const out: EvidenceSpan[] = [];
  raw.forEach((item, idx) => {
    const rec = item as Record<string, unknown>;
    const text = typeof rec.text === 'string' ? rec.text : null;
    if (!text) {
      drops.push({ field: `evidence[${idx}]`, reason: 'no text string' });
      return;
    }
    const supports =
      typeof rec.supports === 'string' && rec.supports.length > 0
        ? (rec.supports as EvidenceSpan['supports'])
        : 'bucket';
    // start/end are recomputed against the real text by the pipeline's
    // substring guard, so placeholder zeros here are fine.
    out.push({ field: 'bug_report', text, start: 0, end: text.length, supports });
  });
  return out;
}

function validateTags(raw: unknown, drops: FieldDrop[]): string[] {
  if (!Array.isArray(raw)) {
    if (raw !== undefined) drops.push({ field: 'secondary_tags', reason: 'not an array' });
    return [];
  }
  const known = new Set<string>(SECONDARY_TAGS);
  const kept: string[] = [];
  for (const t of raw) {
    if (typeof t === 'string' && known.has(t)) kept.push(t);
    else drops.push({ field: 'secondary_tags', reason: `"${String(t)}" is not a known tag` });
  }
  return kept;
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
  const kept: string[] = [];
  const dropped: FieldDrop[] = [];

  const bucket = oneOf(obj.bucket, BUCKET_IDS);
  // A missing/invalid bucket is allowed — the model abstains, rules lead.
  if (bucket) kept.push('bucket');
  else dropped.push({ field: 'bucket', reason: obj.bucket === undefined ? 'missing — model abstained' : `"${String(obj.bucket)}" is not a bucket id` });

  const signals = validateSignals(obj.signals, dropped, kept);
  const secondary_tags = validateTags(obj.secondary_tags, dropped);
  if (secondary_tags.length) kept.push('secondary_tags');
  const evidence = validateEvidence(obj.evidence, dropped);
  if (evidence.length) kept.push('evidence');
  const rationale = typeof obj.rationale === 'string' ? obj.rationale : null;
  if (rationale) kept.push('rationale');
  else if (obj.rationale !== undefined) dropped.push({ field: 'rationale', reason: 'not a string' });

  const pass: ClassificationPass = {
    bucket,
    bucketScores: { STT: 0, TTS: 0, LLM: 0, POST_CALL: 0, INFRA: 0 },
    topScore: 0,
    signals,
    secondary_tags,
    evidence,
    rationale,
  };

  return { ok: true, pass, kept, dropped };
}
