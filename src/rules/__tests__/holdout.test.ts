// ============================================================
// holdout.test.ts — generalization guard.
// The 30 cases in holdout.ts are phrased differently from the 15 seeds
// (different vocabulary, several with no keyword hits at all). This test
// runs the real rules-only pipeline over them and asserts the documented
// rules-only TARGETS as a floor, not a per-case answer key:
//     bucket   >= 22 / 30
//     severity >= 21 / 30
// If a change here drops below the floor, the rules stopped generalising.
// Bucket and severity are separate numbers on purpose.
// ============================================================

import { describe, expect, it } from 'vitest';
import { classifyRulesOnly } from '../pipeline';
import { HOLDOUT } from './holdout';

const RULES_ONLY_BUCKET_FLOOR = 22;
const RULES_ONLY_SEVERITY_FLOOR = 21;

describe('hold-out set — rules-only generalization', () => {
  const results = HOLDOUT.map((c) => {
    const r = classifyRulesOnly({
      bug_report: c.bug_report,
      customer: c.customer,
      call_id: c.call_id,
      started_at: null,
      impact: c.impact,
    });
    return {
      id: c.id,
      bucketOk: r.bucket === c.expected_bucket,
      severityOk: r.severity === c.expected_severity,
      got: `${r.bucket}/${r.severity}`,
      want: `${c.expected_bucket}/${c.expected_severity}`,
    };
  });

  const bucketOk = results.filter((r) => r.bucketOk).length;
  const severityOk = results.filter((r) => r.severityOk).length;

  it(`bucket accuracy >= ${RULES_ONLY_BUCKET_FLOOR}/30 (got ${bucketOk})`, () => {
    expect(bucketOk).toBeGreaterThanOrEqual(RULES_ONLY_BUCKET_FLOOR);
  });

  it(`severity accuracy >= ${RULES_ONLY_SEVERITY_FLOOR}/30 (got ${severityOk})`, () => {
    expect(severityOk).toBeGreaterThanOrEqual(RULES_ONLY_SEVERITY_FLOOR);
  });

  it('no case throws or returns an out-of-range value', () => {
    for (const r of results) {
      expect(r.got).toMatch(/^(STT|TTS|LLM|POST_CALL|INFRA)\/(Sev0|Sev1|Sev2|Sev3)$/);
    }
  });
});
