// ============================================================
// pipeline.test.ts — the rules suite.
// Runs the real pipeline in rules-only mode over the 15 seeds and 6
// adversarial cases, asserting bucket and severity. If a row fails,
// fix the rules, not the assertion.
// ============================================================

import { describe, expect, it } from 'vitest';
import { classifyRulesOnly } from '../pipeline';
import { severity } from '../severity';
import { normalize } from '../normalize';
import { extractSignals } from '../signals';
import { buildEvidence } from '../evidence';
import { SEED_INPUTS } from '../../store/seed';
import { ADVERSARIAL, EXPECTED_SEEDS } from './expected';
import type { Signals } from '../../types';

describe('15 seed reports match the answer key', () => {
  EXPECTED_SEEDS.forEach((expected, i) => {
    const input = SEED_INPUTS[i];
    it(`seed ${i + 1}: ${expected.bucket}/${expected.severity} — ${expected.why}`, () => {
      const result = classifyRulesOnly(input);
      expect(result.bucket, 'bucket').toBe(expected.bucket);
      expect(result.severity, 'severity').toBe(expected.severity);
    });
  });
});

describe('6 adversarial cases (not in the seed store)', () => {
  ADVERSARIAL.forEach((c) => {
    it(`${c.name} -> ${c.expected.bucket}/${c.expected.severity}`, () => {
      const result = classifyRulesOnly(c.input);
      expect(result.bucket, 'bucket').toBe(c.expected.bucket);
      expect(result.severity, 'severity').toBe(c.expected.severity);
    });
  });
});

describe('severity() invariants', () => {
  const clean: Signals = {
    functional_loss: 'degraded',
    data_integrity: 'clean',
    data_loss_ongoing: false,
    exposure: 'none',
    exposure_prompt_level: false,
    silent_failure: false,
    outage_language: false,
  };

  it('outage short-circuits to Sev0 before anything else runs', () => {
    expect(severity('outage', clean).level).toBe('Sev0');
    expect(severity('single', { ...clean, outage_language: true }).level).toBe('Sev0');
  });

  it('floors only ever raise, never lower', () => {
    const base = severity('many', { ...clean, functional_loss: 'broken' }).level; // Sev1
    const withHarm = severity('many', {
      ...clean,
      functional_loss: 'broken',
      exposure: 'customer_harm',
    }).level;
    expect(base).toBe('Sev1');
    expect(withHarm).toBe('Sev1'); // customer_harm floor is Sev2, cannot pull Sev1 down
  });

  it('silent-failure modifier cannot manufacture a Sev0 on its own', () => {
    const r = severity('single', {
      ...clean,
      functional_loss: 'degraded',
      silent_failure: true,
    });
    expect(r.level).not.toBe('Sev0');
  });

  it('every result carries at least one reason', () => {
    for (const impact of ['single', 'many', 'outage'] as const) {
      expect(severity(impact, clean).reasons.length).toBeGreaterThan(0);
    }
  });
});

describe('evidence spans are always verbatim substrings', () => {
  it('drops any span that is not in the submitted text', () => {
    const text = SEED_INPUTS[4].bug_report; // the 500-errors report
    const { lower } = normalize(text);
    const signals = extractSignals(lower);
    const spans = buildEvidence(text, ['500', 'endpoint', 'not-in-the-text'], lower, signals);
    for (const span of spans) {
      expect(text.slice(span.start, span.end)).toBe(span.text);
      expect(text.toLowerCase().includes(span.text.toLowerCase())).toBe(true);
    }
    expect(spans.some((s) => s.text.toLowerCase() === 'not-in-the-text')).toBe(false);
  });

  it('never emits overlapping spans ("error" nested in "errors")', () => {
    const text = SEED_INPUTS[4].bug_report;
    const { lower } = normalize(text);
    const signals = extractSignals(lower);
    const spans = buildEvidence(text, ['error', 'errors', 'endpoint'], lower, signals);
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i].start).toBeGreaterThanOrEqual(spans[i - 1].end);
    }
    expect(spans.every((s) => s.text.trim().length > 1)).toBe(true);
  });
});

describe('classifier provenance in rules-only mode', () => {
  it('reports rules mode and no LLM bucket', () => {
    const r = classifyRulesOnly(SEED_INPUTS[0]);
    expect(r.classifier_mode).toBe('rules');
    expect(r.llm_bucket).toBeNull();
    expect(r.rules_bucket).toBe(r.bucket);
  });
});
