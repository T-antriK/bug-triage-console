/**
 * WHAT THIS DOES
 * Sets High / Medium / Low confidence by cross-checking two independent
 * methods (rules and LLM), not by asking a model to rate itself.
 *
 *   High   — rules and LLM picked the same bucket, and evidence spans verified
 *   Medium — same bucket but weak/unverified evidence, or one method abstained
 *   Low    — different buckets, or rules-only with a top score under 4,
 *            or the LLM call failed
 *
 * HOW TO CHANGE IT
 * The "weak score" cut-off is CLASSIFIER.RULES_TOP_SCORE_LOW_THRESHOLD in
 * config.ts. The agreement / abstention logic is the if-ladder below;
 * it is written to be read top to bottom.
 *
 * WHY IT WORKS THIS WAY
 * A single model's self-reported confidence is close to noise. Agreement
 * between a keyword engine and a language model is a real signal: they
 * fail in different ways, so when they agree the answer is usually solid.
 * Low confidence blocks the Route button until a human decides.
 */

import type { Confidence } from '../types';
import { CLASSIFIER } from '../config';

export type ConfidenceInput = {
  mode: 'rules' | 'llm' | 'hybrid';
  rules_bucket: string | null;
  llm_bucket: string | null;
  llm_failed: boolean;
  rules_top_score: number;
  evidence_verified_count: number;
};

export function computeConfidence(input: ConfidenceInput): Confidence {
  const {
    rules_bucket,
    llm_bucket,
    llm_failed,
    rules_top_score,
    evidence_verified_count,
  } = input;

  // Low — the LLM call failed outright.
  if (llm_failed) return 'Low';

  // Both methods ran and produced a bucket.
  if (rules_bucket && llm_bucket) {
    if (rules_bucket !== llm_bucket) return 'Low'; // genuine disagreement
    if (evidence_verified_count > 0 && rules_top_score >= CLASSIFIER.RULES_TOP_SCORE_LOW_THRESHOLD) {
      return 'High';
    }
    return 'Medium'; // agreed, but the support is thin
  }

  // Exactly one method produced a bucket (the other abstained or was off).
  const soleScore = rules_bucket ? rules_top_score : 0;
  if (rules_bucket && !llm_bucket) {
    return soleScore < CLASSIFIER.RULES_TOP_SCORE_LOW_THRESHOLD ? 'Low' : 'Medium';
  }
  if (!rules_bucket && llm_bucket) {
    return 'Medium';
  }

  // Neither method could pick a bucket.
  return 'Low';
}
