/**
 * WHAT THIS DOES
 * The orchestrator. Runs the fixed pipeline: normalize -> rules pass +
 * optional LLM pass -> arbitrate -> tiebreaks -> impact escalation ->
 * severity -> routing -> confidence -> evidence -> questions ->
 * secondary tags. Each step is a pure function from the step before it.
 *
 * Signal merge rule: for each of the seven signals, take the MORE SEVERE
 * of the rules reading and the LLM reading. Either method can escalate a
 * signal; neither can suppress the other.
 *
 * Under-triage costs more than over-triage in a system with a human
 * confirm step.
 *
 * HOW TO CHANGE IT
 * You almost never edit this file to change behaviour — you edit the
 * rules modules it calls. Change this file only to reorder the pipeline
 * or to change how the rules and LLM readings are combined.
 *
 * WHY IT WORKS THIS WAY
 * One fixed order, pure steps, explanation accumulated as a byproduct.
 * The LLM contributes a bucket, signals and evidence; it never picks a
 * severity. That is what keeps severity comparable across reporters.
 */

import type {
  Arbitrated,
  BucketId,
  ClassificationPass,
  Confidence,
  EvidenceSpan,
  LlmOutcome,
  PipelineResult,
  Signals,
  TriageInput,
} from '../types';
import { normalize } from './normalize';
import { ALL_BUCKETS, BUCKET_PRECEDENCE, scoreBuckets } from './buckets';
import { applyTiebreaks } from './tiebreaks';
import { SIGNAL_DEFAULTS, extractSignals } from './signals';
import { severity } from './severity';
import { escalateImpact } from './impactEscalation';
import { escalationsFor, routeBucket } from './routing';
import { computeConfidence } from './confidence';
import { MAX_SPANS, buildEvidence } from './evidence';
import { buildQuestions } from './questions';
import { SECONDARY_TAGS, buildSecondaryTags, type SecondaryTag } from './secondaryTags';
import { buildTrace } from './trace';

// ---- per-signal severity ordering, worst first ----
// Exported so the verbose signals-merge trace reports which source won
// using the exact same ordering the merge uses.
export const ORDER = {
  functional_loss: ['broken', 'degraded', 'cosmetic'] as const,
  data_integrity: ['lost', 'at_risk', 'clean'] as const,
  exposure: ['legal', 'customer_harm', 'none'] as const,
};

function worse<T extends string>(order: readonly T[], a: T, b: T): T {
  return order.indexOf(a) <= order.indexOf(b) ? a : b;
}

/** Take the more severe of two signal sets, field by field. */
export function mergeSignals(a: Signals, b: Signals): Signals {
  return {
    functional_loss: worse(ORDER.functional_loss, a.functional_loss, b.functional_loss),
    data_integrity: worse(ORDER.data_integrity, a.data_integrity, b.data_integrity),
    data_loss_ongoing: a.data_loss_ongoing || b.data_loss_ongoing,
    exposure: worse(ORDER.exposure, a.exposure, b.exposure),
    exposure_prompt_level: a.exposure_prompt_level || b.exposure_prompt_level,
    silent_failure: a.silent_failure || b.silent_failure,
    outage_language: a.outage_language || b.outage_language,
  };
}

/** Earliest bucket in BUCKET_PRECEDENCE among the given set. */
function byPrecedence(buckets: readonly BucketId[]): BucketId | null {
  for (const b of BUCKET_PRECEDENCE) if (buckets.includes(b)) return b;
  return buckets[0] ?? null;
}

// ---- rules pass ----
export function runRulesPass(input: TriageInput): ClassificationPass & {
  matchedPatterns: Record<BucketId, string[]>;
  contenders: BucketId[];
  scoring: ReturnType<typeof scoreBuckets>;
  pick_via: 'tiebreak' | 'score' | 'precedence' | 'abstain';
  pick_via_detail: string;
} {
  const { lower } = normalize(input.bug_report);
  const scoring = scoreBuckets(lower);
  const signals = extractSignals(lower);

  // Two contender sets. `scored` is buckets with a positive net score —
  // these are what "highest score wins" ranks. `matched` also includes a
  // bucket whose score was dragged to zero by a negative keyword: a
  // boundary rule should still get to speak for it, because "when two
  // buckets both match, the boundary rules decide, not the score."
  const scored = ALL_BUCKETS.filter((b) => scoring.scores[b] > 0);
  const matched = ALL_BUCKETS.filter(
    (b) => scoring.scores[b] > 0 || scoring.matchedPatterns[b].length > 0,
  );

  let bucket: BucketId | null = null;
  let pick_via: 'tiebreak' | 'score' | 'precedence' | 'abstain' = 'abstain';
  let pick_via_detail = 'no bucket had a keyword hit';
  if (matched.length > 0) {
    const viaTiebreak = applyTiebreaks(lower, matched);
    if (viaTiebreak) {
      bucket = viaTiebreak.bucket;
      pick_via = 'tiebreak';
      pick_via_detail = `tiebreak: ${viaTiebreak.via}`;
    } else if (scored.length > 0) {
      const top = scoring.topScore;
      const topSet = scored.filter((b) => scoring.scores[b] === top);
      bucket = topSet.length === 1 ? topSet[0] : byPrecedence(topSet);
      pick_via = topSet.length === 1 ? 'score' : 'precedence';
      pick_via_detail =
        topSet.length === 1
          ? `highest score (${top})`
          : `tied on score ${top}, precedence picked ${bucket}`;
    } else {
      // every match was cancelled by a negative and no tiebreak fired
      bucket = byPrecedence(matched);
      pick_via = 'precedence';
      pick_via_detail = `every match cancelled by a negative; precedence picked ${bucket}`;
    }
  }

  return {
    bucket,
    bucketScores: scoring.scores,
    topScore: scoring.topScore,
    signals,
    secondary_tags: buildSecondaryTags(lower, signals, input.impact ?? 'many'),
    evidence: [],
    rationale: null,
    matchedPatterns: scoring.matchedPatterns,
    contenders: matched,
    scoring,
    pick_via,
    pick_via_detail,
  };
}

// ---- arbitration ----
// WHY THE MODEL LEADS ON BUCKET
// Rules match keywords; they do not read language. They misfire on reports
// where infrastructure vocabulary appears in a description of a content
// problem. Example: "same transaction ID logged in both... nobody's seen an
// error" scores INFRA on 'transaction ID' and 'logged' while the report
// explicitly rules out an error. The model reads the clause and correctly
// returns POST_CALL. The model leads on bucket. Rules stay as a backstop
// and as an independent second opinion for confidence.
export function arbitrate(
  lower: string,
  rules: ReturnType<typeof runRulesPass>,
  llm: LlmOutcome | null,
): Arbitrated {
  const llmPass = llm && llm.ok ? llm.pass : null;
  const llmFailed = !!llm && !llm.ok;

  const rules_bucket = rules.bucket;
  const llm_bucket = llmPass?.bucket ?? null;

  const mergedSignals = llmPass
    ? mergeSignals(rules.signals, llmPass.signals)
    : rules.signals;

  // candidate buckets: rules contenders plus whatever the LLM picked
  const contenders = Array.from(
    new Set<BucketId>([...rules.contenders, ...(llm_bucket ? [llm_bucket] : [])]),
  );

  let bucket: BucketId;
  let decision: Arbitrated['decision'] = 'fallback';
  let decision_detail = '';
  let tiebreak_ran = false;
  let tiebreak_via: string | null = null;
  if (rules_bucket && llm_bucket && rules_bucket === llm_bucket) {
    // Both agree — no disambiguation needed.
    bucket = rules_bucket;
    decision = 'agreed';
    decision_detail = `rules and model both said ${bucket}`;
  } else if (rules_bucket && llm_bucket) {
    // Model leads on bucket (see rationale comment above). Rules act as a
    // backstop: confidence drops to Low on disagreement, blocking auto-route.
    // Tiebreaks are keyword-based and suffer the same language blindness as
    // rules; skip them when both methods already have an opinion.
    bucket = llm_bucket;
    decision = 'model_leads_on_disagreement';
    decision_detail = `rules said ${rules_bucket}, model said ${llm_bucket}; model leads, confidence drops to Low`;
  } else {
    // Only one method produced a bucket — use tiebreaks to pick among the
    // rules contenders (or the single LLM bucket if rules abstained).
    const viaTiebreak = applyTiebreaks(lower, contenders);
    tiebreak_ran = contenders.length >= 2;
    tiebreak_via = viaTiebreak?.via ?? null;
    bucket = viaTiebreak?.bucket ?? rules_bucket ?? llm_bucket ?? byPrecedence(contenders) ?? 'INFRA';
    if (viaTiebreak) {
      decision = 'tiebreak';
      decision_detail = `single method; tiebreak "${viaTiebreak.via}" picked ${bucket}`;
    } else if (rules_bucket ?? llm_bucket) {
      decision = 'single_method';
      decision_detail = rules_bucket
        ? `only rules produced a bucket (${bucket})`
        : `only the model produced a bucket (${bucket})`;
    } else {
      decision = 'fallback';
      decision_detail = `neither method produced a bucket; fell back to ${bucket}`;
    }
  }

  const llm_agreed =
    rules_bucket && llm_bucket ? rules_bucket === llm_bucket : llmPass ? null : null;

  const classifier_mode: Arbitrated['classifier_mode'] = !llmPass
    ? 'rules'
    : rules_bucket
      ? 'hybrid'
      : 'llm';

  // merge secondary tags (known set only)
  const known = new Set<string>(SECONDARY_TAGS);
  const tags = Array.from(
    new Set<SecondaryTag>([
      ...(rules.secondary_tags as SecondaryTag[]),
      ...((llmPass?.secondary_tags ?? []).filter((t): t is SecondaryTag => known.has(t))),
    ]),
  );

  return {
    bucket,
    rules_bucket,
    llm_bucket,
    llm_agreed,
    classifier_mode: llmFailed ? 'rules' : classifier_mode,
    bucketScores: rules.bucketScores,
    topScore: rules.topScore,
    signals: mergedSignals,
    secondary_tags: tags,
    evidence: llmPass?.evidence ?? [],
    llm_rationale: llmPass?.rationale ?? null,
    decision,
    decision_detail,
    contenders,
    tiebreak_ran,
    tiebreak_via,
  };
}

// ---- full pipeline ----
export type RunOptions = {
  llm?: LlmOutcome | null;
  llm_provider?: string | null;
  llm_model?: string | null;
  // Verbose mode: when true, a full Trace is built and returned on
  // `.trace`. Guarded here at the call site so nothing trace-related runs
  // when it is false — classification output is byte-identical either way.
  capture_trace?: boolean;
};

export function runPipeline(input: TriageInput, opts: RunOptions = {}): PipelineResult {
  const { original, lower } = normalize(input.bug_report);
  const llm = opts.llm ?? null;
  const llmFailed = !!llm && !llm.ok;

  const rules = runRulesPass(input);
  const merged = arbitrate(lower, rules, llm);

  // 5. impact escalation (text may raise the dropdown, never lower it)
  const esc = escalateImpact(input.impact, merged.signals, lower);

  // 6. severity
  const sev = severity(esc.effective_impact, merged.signals, lower);

  // 8. confidence — needed before escalations (Low blocks auto-route)
  const bucketKeywords = rules.matchedPatterns[merged.bucket] ?? [];
  const rulesBucketSpans = buildEvidence(original, bucketKeywords, lower, merged.signals);
  const {
    verified: llmSpans,
    dropped: llm_spans_dropped,
    droppedSpans: llmDroppedSpans,
  } = verifyLlmSpans(original, merged.evidence);
  const evidence = dedupeSpans([...rulesBucketSpans, ...llmSpans]).slice(0, MAX_SPANS);
  const rulesBucketMatchedPatterns = merged.rules_bucket
    ? (rules.matchedPatterns[merged.rules_bucket] ?? [])
    : null;

  const confidenceInputs = {
    mode: merged.classifier_mode,
    rules_bucket: merged.rules_bucket,
    llm_bucket: merged.llm_bucket,
    llm_failed: llmFailed,
    rules_top_score: merged.topScore,
    evidence_verified_count: evidence.length,
  };
  const confidence: Confidence = computeConfidence(confidenceInputs);

  // 7. routing + escalations
  const route = routeBucket(merged.bucket);
  const escalations = escalationsFor({
    severity: sev.level,
    confidence,
    signals: merged.signals,
  });

  // 10. questions
  const llmExtraQuestion = llm && llm.ok ? firstExtraQuestion(llm.pass) : null;
  const next_questions = buildQuestions(
    merged.bucket,
    input,
    merged.signals,
    confidence === 'Low',
    llmExtraQuestion,
  );

  // ---- verbose: build the trace (nothing above this line changed) ----
  let trace: PipelineResult['trace'] = null;
  if (opts.capture_trace) {
    trace = buildTrace({
      original,
      lower,
      rules,
      merged,
      llm,
      llmSignals: llm && llm.ok ? llm.pass.signals : null,
      dropdownImpact: input.impact ?? 'many',
      esc,
      confidenceInputs,
      confidenceResult: confidence,
      rulesSpans: rulesBucketSpans,
      llmVerified: llmSpans,
      llmDropped: llmDroppedSpans,
      finalEvidence: evidence,
      questionsBucket: merged.bucket,
      input,
      confidenceLow: confidence === 'Low',
      llmExtraQuestion,
    });
  }

  return {
    bucket: merged.bucket,
    secondary_tags: merged.secondary_tags,
    severity: sev.level,
    confidence,
    routing_suggestion: route.team,
    evidence,
    reason_chain: sev.reasons,
    next_questions,
    signals: merged.signals,
    escalations,
    impact_escalated_from: esc.impact_escalated_from,
    narrower_than_selected: esc.narrower_than_selected,
    effective_impact: esc.effective_impact,
    rules_top_score: merged.topScore,
    classifier_mode: merged.classifier_mode,
    llm_provider: llm && llm.ok ? (opts.llm_provider ?? null) : llmFailed ? (opts.llm_provider ?? null) : null,
    llm_model: llm && llm.ok ? (opts.llm_model ?? null) : llmFailed ? (opts.llm_model ?? null) : null,
    llm_agreed: merged.llm_agreed,
    rules_bucket: merged.rules_bucket,
    llm_bucket: merged.llm_bucket,
    llm_rationale: merged.llm_rationale,
    rules_matched_patterns: rulesBucketMatchedPatterns,
    llm_spans_dropped,
    trace,
  };
}

/** Rules-only convenience used by seeds, the eval harness and the tests. */
export function classifyRulesOnly(input: TriageInput): PipelineResult {
  return runPipeline(input, { llm: null });
}

// ---- helpers ----
function verifyLlmSpans(
  original: string,
  spans: EvidenceSpan[],
): { verified: EvidenceSpan[]; dropped: number; droppedSpans: EvidenceSpan[] } {
  const verified: EvidenceSpan[] = [];
  const droppedSpans: EvidenceSpan[] = [];
  const hay = original.toLowerCase();
  for (const span of spans) {
    const idx = hay.indexOf(span.text.toLowerCase());
    if (idx < 0) {
      droppedSpans.push(span); // substring guard: paraphrase, not a verbatim quote
      continue;
    }
    verified.push({
      field: 'bug_report',
      text: original.slice(idx, idx + span.text.length),
      start: idx,
      end: idx + span.text.length,
      supports: span.supports,
      provenance: 'llm',
    });
  }
  return { verified, dropped: droppedSpans.length, droppedSpans };
}

function dedupeSpans(spans: EvidenceSpan[]): EvidenceSpan[] {
  // Sort by start, then longest-first at a tie. For overlapping spans with
  // the same `supports`, promote provenance to 'both' (rules and LLM agreed
  // on the same stretch). For all other overlaps, drop the shorter span.
  const sorted = [...spans].sort(
    (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start),
  );
  const out: EvidenceSpan[] = [];
  let lastEnd = -1;
  for (const s of sorted) {
    if (s.start < lastEnd) {
      const prev = out[out.length - 1];
      if (prev && s.supports === prev.supports && s.provenance !== prev.provenance) {
        out[out.length - 1] = { ...prev, provenance: 'both' };
      }
      continue;
    }
    out.push(s);
    lastEnd = s.end;
  }
  return out;
}

function firstExtraQuestion(pass: ClassificationPass): string | null {
  // The LLM prompt does not ask for questions directly; this hook is kept
  // so a future prompt revision can pass one through pass.rationale-style.
  void SIGNAL_DEFAULTS;
  void pass;
  return null;
}
