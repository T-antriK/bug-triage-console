// ============================================================
// trace.test.ts — verbose mode / decision trace.
//   - verbose ON vs OFF produce identical classification output
//   - the trace has exactly one step per pipeline step
//   - the explain* functions don't drift from the real rule functions
//   - trace eviction respects the cap
// ============================================================

import { describe, expect, it } from 'vitest';
import { classifyRulesOnly, runPipeline } from '../pipeline';
import { severity } from '../severity';
import { computeConfidence } from '../confidence';
import { scoreBuckets } from '../buckets';
import { normalize } from '../normalize';
import { extractSignals } from '../signals';
import { runRulesPass } from '../pipeline';
import {
  explainConfidence,
  explainRulesBucket,
  explainSeverity,
} from '../trace';
import { TRACE } from '../../config';
import { SEED_INPUTS } from '../../store/seed';
import { HOLDOUT } from './holdout';
import { evictOldest } from '../../store/traces';
import type { RulesBucketDetail, SeverityDetail, Signals, StoredTrace } from '../../types';

const ALL_INPUTS = [
  ...SEED_INPUTS,
  ...HOLDOUT.map((c) => ({
    bug_report: c.bug_report,
    customer: c.customer,
    call_id: c.call_id,
    started_at: null as string | null,
    impact: c.impact,
  })),
];

describe('verbose on/off produce byte-identical classification', () => {
  ALL_INPUTS.forEach((input, i) => {
    it(`case ${i + 1}`, () => {
      const off = runPipeline(input, { llm: null });
      const on = runPipeline(input, { llm: null, capture_trace: true });

      expect(off.trace).toBeNull();
      expect(on.trace).not.toBeNull();

      // every field except `trace` must match exactly
      const strip = (r: typeof off) => {
        const { trace: _t, ...rest } = r;
        return rest;
      };
      expect(strip(on)).toEqual(strip(off));

      // the four fields the spec calls out explicitly
      expect(on.bucket).toBe(off.bucket);
      expect(on.severity).toBe(off.severity);
      expect(on.confidence).toBe(off.confidence);
      expect(on.evidence).toEqual(off.evidence);
    });
  });
});

describe('trace shape', () => {
  it('has exactly one step per pipeline step, in order', () => {
    const r = runPipeline(SEED_INPUTS[0], { llm: null, capture_trace: true });
    const ids = r.trace!.steps.map((s) => s.id);
    expect(ids).toEqual([...TRACE.STEP_IDS]);
    expect(r.trace!.steps.length).toBe(TRACE.STEP_IDS.length);
  });

  it('every step has a non-empty summary and a detail object', () => {
    const r = runPipeline(SEED_INPUTS[4], { llm: null, capture_trace: true });
    for (const step of r.trace!.steps) {
      expect(typeof step.summary).toBe('string');
      expect(step.summary.length).toBeGreaterThan(0);
      expect(step.detail).toBeTypeOf('object');
    }
  });

  it('llm_call records skipped in rules-only mode', () => {
    const r = classifyRulesOnly(SEED_INPUTS[0]);
    expect(r.trace).toBeNull(); // classifyRulesOnly does not capture
    const traced = runPipeline(SEED_INPUTS[0], { llm: null, capture_trace: true });
    const llmStep = traced.trace!.steps.find((s) => s.id === 'llm_call')!;
    expect((llmStep.detail as { skipped: boolean }).skipped).toBe(true);
  });
});

describe('explain* functions do not drift from the real rule functions', () => {
  const SIGNAL_MATRIX: Signals[] = [];
  const fl = ['broken', 'degraded', 'cosmetic'] as const;
  const di = ['clean', 'at_risk', 'lost'] as const;
  const ex = ['none', 'customer_harm', 'legal'] as const;
  for (const functional_loss of fl)
    for (const data_integrity of di)
      for (const exposure of ex)
        for (const data_loss_ongoing of [false, true])
          for (const silent_failure of [false, true])
            for (const exposure_prompt_level of [false, true])
              SIGNAL_MATRIX.push({
                functional_loss,
                data_integrity,
                data_loss_ongoing,
                exposure,
                exposure_prompt_level,
                silent_failure,
                outage_language: false,
              });

  it('explainSeverity final_level always equals severity().level', () => {
    for (const s of SIGNAL_MATRIX) {
      for (const impact of ['single', 'many', 'outage'] as const) {
        const real = severity(impact, s, '').level;
        const explained = explainSeverity(impact, s, '').final_level;
        expect(explained, `${impact} ${JSON.stringify(s)}`).toBe(real);
      }
    }
  });

  it('explainSeverity floor rows match severity() reason chain firings', () => {
    // a report where the financial_records floor needs the text
    const lower = 'payment transaction was double logged and nothing is saving';
    const s: Signals = {
      functional_loss: 'degraded',
      data_integrity: 'lost',
      data_loss_ongoing: true,
      exposure: 'none',
      exposure_prompt_level: false,
      silent_failure: false,
      outage_language: false,
    };
    const d = explainSeverity('many', s, lower) as SeverityDetail;
    expect(d.final_level).toBe(severity('many', s, lower).level);
    // data_loss_ongoing_at_scale should be the one that fired
    expect(d.floors.find((f) => f.id === 'data_loss_ongoing_at_scale')!.fired).toBe(true);
  });

  it('explainConfidence result matches computeConfidence for every branch', () => {
    const cases = [
      { mode: 'rules', rules_bucket: 'INFRA', llm_bucket: null, llm_failed: false, rules_top_score: 8, evidence_verified_count: 3 },
      { mode: 'rules', rules_bucket: 'INFRA', llm_bucket: null, llm_failed: false, rules_top_score: 2, evidence_verified_count: 1 },
      { mode: 'hybrid', rules_bucket: 'INFRA', llm_bucket: 'INFRA', llm_failed: false, rules_top_score: 8, evidence_verified_count: 3 },
      { mode: 'hybrid', rules_bucket: 'INFRA', llm_bucket: 'INFRA', llm_failed: false, rules_top_score: 2, evidence_verified_count: 0 },
      { mode: 'hybrid', rules_bucket: 'INFRA', llm_bucket: 'POST_CALL', llm_failed: false, rules_top_score: 8, evidence_verified_count: 3 },
      { mode: 'llm', rules_bucket: null, llm_bucket: 'POST_CALL', llm_failed: false, rules_top_score: 0, evidence_verified_count: 1 },
      { mode: 'rules', rules_bucket: null, llm_bucket: null, llm_failed: true, rules_top_score: 0, evidence_verified_count: 0 },
      { mode: 'rules', rules_bucket: null, llm_bucket: null, llm_failed: false, rules_top_score: 0, evidence_verified_count: 0 },
    ] as const;
    for (const c of cases) {
      const real = computeConfidence(c);
      const explained = explainConfidence(c, real);
      expect(explained.result).toBe(real);
      expect(explained.branch.length).toBeGreaterThan(0);
    }
  });

  it('explainRulesBucket scores match scoreBuckets for every seed and hold-out case', () => {
    for (const input of ALL_INPUTS) {
      const { lower } = normalize(input.bug_report);
      const scoring = scoreBuckets(lower);
      const rules = runRulesPass(input);
      const d = explainRulesBucket(lower, rules) as RulesBucketDetail;
      for (const row of d.per_bucket) {
        expect(row.score, `${input.bug_report.slice(0, 40)} / ${row.bucket}`).toBe(
          scoring.scores[row.bucket],
        );
      }
      expect(d.picked).toBe(rules.bucket);
    }
  });

  it('signals-merge trace agrees with extractSignals in rules-only mode', () => {
    for (const input of ALL_INPUTS.slice(0, 10)) {
      const { lower } = normalize(input.bug_report);
      const sig = extractSignals(lower);
      const traced = runPipeline(input, { llm: null, capture_trace: true });
      const step = traced.trace!.steps.find((s) => s.id === 'signals_merge')!;
      const detail = step.detail as { llm_present: boolean; per_signal: Array<{ signal: string; merged: string }> };
      expect(detail.llm_present).toBe(false);
      for (const row of detail.per_signal) {
        expect(row.merged).toBe(String(sig[row.signal as keyof Signals]));
      }
    }
  });
});

describe('trace store eviction', () => {
  it('keeps only the N most recent, evicting oldest first', () => {
    const rows: StoredTrace[] = Array.from({ length: 60 }, (_, i) => ({
      report_id: `RPT-${String(i).padStart(4, '0')}`,
      captured_at: new Date(2026, 0, 1, 0, i).toISOString(), // increasing
      trace: { trace_schema_version: 1, captured_at: '', verbose: true as const, steps: [] },
    }));
    const capped = evictOldest(rows, TRACE.STORE_CAP);
    expect(capped.length).toBe(TRACE.STORE_CAP);
    // the ones kept are the newest
    expect(capped[0].report_id).toBe('RPT-0010'); // 60 - 50 = 10 oldest dropped
    expect(capped[capped.length - 1].report_id).toBe('RPT-0059');
  });

  it('is a no-op below the cap', () => {
    const rows: StoredTrace[] = Array.from({ length: 5 }, (_, i) => ({
      report_id: `RPT-${i}`,
      captured_at: new Date(2026, 0, 1, 0, i).toISOString(),
      trace: { trace_schema_version: 1, captured_at: '', verbose: true as const, steps: [] },
    }));
    expect(evictOldest(rows, TRACE.STORE_CAP).length).toBe(5);
  });
});
