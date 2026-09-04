/**
 * WHAT THIS DOES
 * Turns one pipeline run into a Trace: 11 steps, each with a one-line
 * summary and a structured detail. Every function here is PURE
 * OBSERVATION. It re-derives the "why" from the same rule tables the
 * pipeline uses — it never re-runs a decision or changes one.
 *
 * HOW TO CHANGE IT
 * If you add a step to pipeline.ts, add its id to TRACE.STEP_IDS in
 * config.ts and a builder here. If you change a rule table (buckets,
 * floors, tiebreaks, questions), the explain* functions read the same
 * table, so the trace follows automatically — the drift tests in
 * __tests__/trace.test.ts prove the explanation still agrees with the
 * real function.
 *
 * WHY IT WORKS THIS WAY
 * The trace is only ever built inside an `if (capture)` guard in
 * pipeline.ts / lib/triage.ts. When verbose is off, none of this runs
 * and classification output is byte-identical.
 */

import type {
  ArbitrationDetail,
  BucketId,
  ConfidenceDetail,
  EvidenceDetail,
  EvidenceSpan,
  Impact,
  ImpactEscalationDetail,
  LlmCallDetail,
  LlmOutcome,
  NormalizeDetail,
  QuestionsDetail,
  RulesBucketDetail,
  SeverityDetail,
  Signals,
  SignalsMergeDetail,
  TiebreaksDetail,
  Trace,
  TraceStep,
  TriageInput,
} from '../types';
import { CLASSIFIER, TRACE, TRACE_COPY } from '../config';
import { ALL_BUCKETS, BUCKETS, SCORE_NEGATIVE_HIT, SCORE_PATTERN_HIT } from './buckets';
import { matched } from './normalize';
import { TIEBREAKS } from './tiebreaks';
import { NARROWER_PHRASES } from './impactEscalation';
import { signalMatches } from './signals';
import { CONDITIONAL_QUESTIONS, QUESTIONS } from './questions';
import { MAX_SPANS } from './evidence';
import { VALIDATION } from '../config';
import {
  BASE_GRID,
  FINANCIAL_RECORDS_TERMS,
  FLOORS,
  FLOOR_SIGNAL_KEYS,
  RANK,
  SILENT_MODIFIER,
  moreSevere,
  raiseBy,
  silentModifierGate,
} from './severity';
import { ORDER, mergeSignals, type runRulesPass, type arbitrate } from './pipeline';

type RulesPass = ReturnType<typeof runRulesPass>;
type Arbitrated = ReturnType<typeof arbitrate>;

// ============================================================
// 1. normalize
// ============================================================
export function explainNormalize(original: string, normalised: string): NormalizeDetail {
  const changes: string[] = [];
  if (/[A-Z]/.test(original)) changes.push('lowercased');
  if (/[‘’ʼ′]/.test(original)) changes.push('curly apostrophes → straight');
  if (/[“”]/.test(original)) changes.push('curly double quotes → straight');
  if (/[–—−]/.test(original)) changes.push('en / em dash → hyphen');
  if (/ /.test(original)) changes.push('non-breaking space → space');
  if (/\s{2,}/.test(original) || /^\s|\s$/.test(original)) {
    changes.push('collapsed runs of whitespace, trimmed the ends');
  }
  if (changes.length === 0) changes.push(TRACE_COPY.L_NO_CHANGES);
  return { original, normalised, changes };
}

// ============================================================
// 2. rules bucket
// ============================================================
export function explainRulesBucket(lower: string, rules: RulesPass): RulesBucketDetail {
  const per_bucket = ALL_BUCKETS.map((bucket) => {
    const def = BUCKETS[bucket];
    const hitKeywords = rules.scoring.matchedPatterns[bucket];
    const hits = hitKeywords.map((keyword) => ({ keyword, index: lower.indexOf(keyword) }));
    const negKeywords = matched(lower, def.negative);
    const negatives = negKeywords.map((keyword) => ({
      keyword,
      penalty: SCORE_NEGATIVE_HIT,
    }));
    const raw_score = hits.length * SCORE_PATTERN_HIT + negatives.length * SCORE_NEGATIVE_HIT;
    return { bucket, score: rules.scoring.scores[bucket], raw_score, hits, negatives };
  });

  const ranking = [...ALL_BUCKETS]
    .filter((b) => rules.scoring.scores[b] > 0)
    .sort((a, b) => rules.scoring.scores[b] - rules.scoring.scores[a]);

  return {
    per_bucket,
    ranking,
    contenders: rules.contenders,
    picked: rules.bucket,
    via: rules.pick_via,
    via_detail: rules.pick_via_detail,
  };
}

// ============================================================
// 3. model call — the network detail comes from LlmOutcome.debug,
//    attached by client.ts only when verbose is on.
// ============================================================
export function explainLlmCall(llm: LlmOutcome | null): LlmCallDetail {
  if (!llm) {
    return { skipped: true, reason: 'rules-only — no model configured or no key' };
  }
  if (llm.debug) {
    const d = llm.debug;
    return {
      skipped: false,
      provider: d.provider,
      model: d.model,
      endpoint: d.endpoint,
      latency_ms: d.latency_ms,
      http_status: d.http_status,
      raw_body: d.raw_body,
      fields_kept: d.fields_kept,
      fields_dropped: d.fields_dropped,
      failure: d.failure,
    };
  }
  // Verbose was on but no debug was attached (shouldn't happen) — record
  // what we still know.
  return {
    skipped: false,
    provider: '(unknown)',
    model: null,
    endpoint: '(unknown)',
    latency_ms: 0,
    http_status: null,
    raw_body: '',
    fields_kept: llm.ok ? ['bucket', 'signals', 'secondary_tags', 'evidence', 'rationale'] : [],
    fields_dropped: [],
    failure: llm.ok ? null : llm.failure,
  };
}

// ============================================================
// 4. arbitration
// ============================================================
export function explainArbitration(merged: Arbitrated): ArbitrationDetail {
  return {
    rules_bucket: merged.rules_bucket,
    llm_bucket: merged.llm_bucket,
    agreed: merged.llm_agreed,
    winner: merged.bucket,
    rule: merged.decision,
    rule_detail: merged.decision_detail,
  };
}

// ============================================================
// 5. tiebreaks
// ============================================================
export function explainTiebreaks(lower: string, rules: RulesPass): TiebreaksDetail {
  const contenders = rules.contenders;
  const ran = contenders.length >= 2;
  const evaluated = TIEBREAKS.map((rule) => {
    const picked = ran ? rule.decide(lower, contenders) : null;
    return {
      name: rule.name,
      plain_english: rule.plainEnglish,
      fired: picked != null,
      picked,
    };
  });
  return {
    ran,
    not_run_reason: ran ? null : 'fewer than two contending buckets',
    contenders: [...contenders],
    evaluated,
  };
}

// ============================================================
// 6. signals merge
// ============================================================
const SIGNAL_KEYS: ReadonlyArray<keyof Signals> = [
  'functional_loss',
  'data_integrity',
  'data_loss_ongoing',
  'exposure',
  'exposure_prompt_level',
  'silent_failure',
  'outage_language',
];

function order3(key: keyof Signals): readonly string[] | null {
  if (key === 'functional_loss') return ORDER.functional_loss;
  if (key === 'data_integrity') return ORDER.data_integrity;
  if (key === 'exposure') return ORDER.exposure;
  return null;
}

export function explainSignalsMerge(
  rulesSignals: Signals,
  llmSignals: Signals | null,
): SignalsMergeDetail {
  const merged = llmSignals ? mergeSignals(rulesSignals, llmSignals) : rulesSignals;
  const per_signal = SIGNAL_KEYS.map((signal) => {
    const rulesVal = String(rulesSignals[signal]);
    const llmVal = llmSignals ? String(llmSignals[signal]) : null;
    const mergedVal = String(merged[signal]);
    let source: 'rules' | 'llm' | 'equal' = 'equal';
    if (llmVal === null || rulesVal === llmVal) {
      source = 'equal';
    } else if (mergedVal === rulesVal) {
      source = 'rules';
    } else {
      source = 'llm';
    }
    return {
      signal,
      rules_value: rulesVal,
      llm_value: llmVal,
      merged: mergedVal,
      source,
    };
  });
  void order3; // kept for reference: the ranking merge uses ORDER directly via mergeSignals
  return { llm_present: !!llmSignals, per_signal };
}

// ============================================================
// 7. impact escalation
// ============================================================
export function explainImpactEscalation(
  dropdown: Impact,
  signals: Signals,
  lower: string,
  esc: { effective_impact: Impact; impact_escalated_from: Impact | null; narrower_than_selected: boolean },
): ImpactEscalationDetail {
  return {
    dropdown,
    effective: esc.effective_impact,
    escalated: esc.impact_escalated_from != null,
    escalated_from: esc.impact_escalated_from,
    trigger_keywords: signals.outage_language ? signalMatches(lower, 'outage_language') : [],
    narrower_flag: esc.narrower_than_selected,
    narrower_keywords: matched(lower, NARROWER_PHRASES),
  };
}

// ============================================================
// 8. severity — the floor table. Mirrors severity() exactly, reading
//    the same BASE_GRID / FLOORS / SILENT_MODIFIER tables and helpers.
// ============================================================
export function explainSeverity(impact: Impact, s: Signals, lower: string): SeverityDetail {
  // Step 1 — outage short-circuit
  if (impact === 'outage' || s.outage_language) {
    return {
      impact,
      short_circuit: true,
      short_circuit_reason:
        impact === 'outage'
          ? "impact dropdown is 'outage'"
          : 'outage_language signal is set',
      base: null,
      floors: [],
      silent_modifier: {
        silent_failure: s.silent_failure,
        gate_passed: silentModifierGate(s),
        applied: false,
        level_before: 'Sev0',
        level_after: 'Sev0',
        cap: SILENT_MODIFIER.capAt,
      },
      final_level: 'Sev0',
    };
  }

  // Step 2 — base grid
  const radius: 'many' | 'single' = impact === 'single' ? 'single' : 'many';
  let level = BASE_GRID[radius][s.functional_loss];
  const base = { radius, functional_loss: s.functional_loss, cell: level };

  // Step 3 — floors, in order
  const floors = FLOORS.map((rule) => {
    const fired = rule.when(impact, s, lower);
    if (fired) {
      const raised = moreSevere(level, rule.floor);
      if (RANK[raised] < RANK[level]) level = raised;
    }
    const signal_values: Record<string, string> = {};
    for (const k of FLOOR_SIGNAL_KEYS[rule.id] ?? []) {
      signal_values[k] = String(s[k]);
    }
    if (rule.id === 'financial_records') {
      const terms = matched(lower, FINANCIAL_RECORDS_TERMS);
      signal_values['financial terms matched'] = terms.length ? terms.join(', ') : 'none';
    }
    return {
      id: rule.id,
      condition: rule.condition,
      signal_values,
      fired,
      floor_level: rule.floor,
      level_after: level,
    };
  });

  // Step 4 — silent-failure modifier
  const gate = silentModifierGate(s);
  const level_before = level;
  let applied = false;
  if (s.silent_failure && gate) {
    const raised = raiseBy(level, SILENT_MODIFIER.raise, SILENT_MODIFIER.capAt);
    if (RANK[raised] < RANK[level]) {
      level = raised;
      applied = true;
    }
  }

  return {
    impact,
    short_circuit: false,
    short_circuit_reason: null,
    base,
    floors,
    silent_modifier: {
      silent_failure: s.silent_failure,
      gate_passed: gate,
      applied,
      level_before,
      level_after: level,
      cap: SILENT_MODIFIER.capAt,
    },
    final_level: level,
  };
}

// ============================================================
// 9. confidence — mirrors computeConfidence()'s if-ladder.
// ============================================================
export function explainConfidence(input: ConfidenceDetail['inputs'], result: ConfidenceDetail['result']): ConfidenceDetail {
  const th = CLASSIFIER.RULES_TOP_SCORE_LOW_THRESHOLD;
  let branch: string;
  if (input.llm_failed) {
    branch = 'the model call failed → Low';
  } else if (input.rules_bucket && input.llm_bucket) {
    if (input.rules_bucket !== input.llm_bucket) {
      branch = 'rules and the model picked different buckets → Low';
    } else if (input.evidence_verified_count > 0 && input.rules_top_score >= th) {
      branch = `agreed, evidence verified, rules score ${input.rules_top_score} ≥ ${th} → High`;
    } else {
      branch = 'agreed, but the support is thin (no verified evidence or low score) → Medium';
    }
  } else if (input.rules_bucket && !input.llm_bucket) {
    branch =
      input.rules_top_score < th
        ? `rules only, top score ${input.rules_top_score} < ${th} → Low`
        : `rules only, top score ${input.rules_top_score} ≥ ${th} → Medium`;
  } else if (!input.rules_bucket && input.llm_bucket) {
    branch = 'model only (rules abstained) → Medium';
  } else {
    branch = 'neither method produced a bucket → Low';
  }
  return { branch, inputs: input, result };
}

// ============================================================
// 10. evidence
// ============================================================
export function explainEvidence(
  rulesSpans: EvidenceSpan[],
  llmVerified: EvidenceSpan[],
  llmDropped: EvidenceSpan[],
  finalEvidence: EvidenceSpan[],
): EvidenceDetail {
  const key = (s: EvidenceSpan) => `${s.start}:${s.end}:${s.supports}`;
  const finalKeys = new Set(finalEvidence.map(key));
  const all = [...rulesSpans, ...llmVerified];

  const merge_decisions: string[] = [];
  for (const s of finalEvidence) {
    if (s.provenance === 'both') {
      merge_decisions.push(`"${s.text}" — kept, promoted to 'both' (rules and model marked the same stretch)`);
    }
  }
  for (const s of all) {
    if (!finalKeys.has(key(s))) {
      merge_decisions.push(`"${s.text}" (${s.provenance ?? 'rules'}) — dropped as an overlap of a longer span`);
    }
  }
  if (all.length > MAX_SPANS) {
    merge_decisions.push(`list capped at MAX_SPANS (${MAX_SPANS})`);
  }
  if (merge_decisions.length === 0) merge_decisions.push('no overlaps — every span kept as-is');

  return {
    rules_spans: rulesSpans.map((s) => ({ text: s.text, supports: s.supports })),
    llm_spans_verified: llmVerified.map((s) => ({ text: s.text, supports: s.supports })),
    llm_spans_dropped: llmDropped.map((s) => ({
      text: s.text,
      reason: 'not a verbatim substring of the submitted report',
    })),
    merge_decisions,
    final_count: finalEvidence.length,
  };
}

// ============================================================
// 11. questions — mirrors buildQuestions().
// ============================================================
export function explainQuestions(
  bucket: BucketId,
  input: TriageInput,
  signals: Signals,
  confidenceLow: boolean,
  llmExtra: string | null,
): QuestionsDetail {
  const base_bank = [...QUESTIONS[bucket]];
  const conditionals_fired = CONDITIONAL_QUESTIONS.filter((c) =>
    c.when(input, signals, confidenceLow),
  ).map((c) => ({ ask: c.ask, why: c.why }));

  const ordered = [...base_bank, ...conditionals_fired.map((c) => c.ask)];
  const extra = llmExtra && llmExtra.trim() ? llmExtra.trim() : null;
  if (extra) ordered.push(extra);

  const seen = new Set<string>();
  const before_cap = ordered.filter((q) => {
    if (seen.has(q)) return false;
    seen.add(q);
    return true;
  });
  const final = before_cap.slice(0, VALIDATION.MAX_QUESTIONS_SHOWN);
  const cut_by_cap = before_cap.slice(VALIDATION.MAX_QUESTIONS_SHOWN);

  return {
    bucket,
    base_bank,
    conditionals_fired,
    llm_extra: extra,
    before_cap,
    cut_by_cap,
    final,
  };
}

// ============================================================
// summaries — the one-line collapsed view for each step
// ============================================================
const SEV_LABEL = (l: string) => l;

function summarize(id: (typeof TRACE.STEP_IDS)[number], detail: unknown): string {
  switch (id) {
    case 'normalize': {
      const d = detail as NormalizeDetail;
      return d.changes[0] === TRACE_COPY.L_NO_CHANGES
        ? 'no change — already clean lowercase ASCII'
        : d.changes.join('; ');
    }
    case 'rules_bucket': {
      const d = detail as RulesBucketDetail;
      const scores = [...d.per_bucket]
        .sort((a, b) => b.score - a.score)
        .map((r) => `${r.bucket} ${r.score}`)
        .join(', ');
      const pick = d.picked ? `${d.picked} (${d.via_detail})` : 'abstained — no keyword hit';
      return `${scores} — picked ${pick}`;
    }
    case 'llm_call': {
      const d = detail as LlmCallDetail;
      if (d.skipped) return d.reason;
      if (d.failure) return `${d.provider}/${d.model ?? '?'} — ${d.failure} in ${d.latency_ms} ms`;
      return `${d.provider}/${d.model ?? '?'} — HTTP ${d.http_status ?? '?'} in ${d.latency_ms} ms, ${d.fields_dropped.length} field(s) dropped`;
    }
    case 'arbitration': {
      const d = detail as ArbitrationDetail;
      if (d.rule === 'agreed') return `agreed — both said ${d.winner}`;
      if (d.rule === 'model_leads_on_disagreement') {
        return `disagreed — model ${d.llm_bucket} used over rules ${d.rules_bucket}`;
      }
      return d.rule_detail;
    }
    case 'tiebreaks': {
      const d = detail as TiebreaksDetail;
      if (!d.ran) return `not run — ${d.not_run_reason}`;
      const fired = d.evaluated.filter((e) => e.fired);
      return fired.length
        ? `${fired.map((f) => `${f.name} → ${f.picked}`).join(', ')}`
        : `evaluated ${d.evaluated.length}, none fired`;
    }
    case 'signals_merge': {
      const d = detail as SignalsMergeDetail;
      if (!d.llm_present) return 'rules-only — no model signals to merge';
      const escalated = d.per_signal.filter((r) => r.source === 'llm');
      return escalated.length
        ? `model escalated: ${escalated.map((r) => `${r.signal} ${r.rules_value}→${r.merged}`).join(', ')}`
        : 'model agreed on every signal';
    }
    case 'impact_escalation': {
      const d = detail as ImpactEscalationDetail;
      if (d.escalated) {
        return `${d.escalated_from} → ${d.effective} (outage language: ${d.trigger_keywords.join(', ')})`;
      }
      if (d.narrower_flag) return `${d.dropdown} kept, flagged narrower-than-selected`;
      return `${d.dropdown} — no escalation`;
    }
    case 'severity': {
      const d = detail as SeverityDetail;
      if (d.short_circuit) return `Sev0 — ${d.short_circuit_reason}`;
      // Only name the floors that actually moved the level.
      let prev = d.base?.cell ?? d.final_level;
      const parts: string[] = [`${prev} base`];
      for (const f of d.floors) {
        if (f.level_after !== prev) {
          parts.push(`→ ${f.level_after} (${f.id} floor)`);
          prev = f.level_after;
        }
      }
      if (d.silent_modifier.applied) {
        parts.push(`→ ${d.silent_modifier.level_after} (silent-failure modifier)`);
      }
      return `${SEV_LABEL(d.final_level)}: ${parts.join(' ')}`;
    }
    case 'confidence': {
      const d = detail as ConfidenceDetail;
      return `${d.result} — ${d.branch}`;
    }
    case 'evidence': {
      const d = detail as EvidenceDetail;
      return `${d.final_count} spans kept, ${d.llm_spans_dropped.length} dropped by substring guard`;
    }
    case 'questions': {
      const d = detail as QuestionsDetail;
      const cut = d.cut_by_cap.length;
      return cut
        ? `${d.final.length} shown, ${cut} cut by the cap of ${VALIDATION.MAX_QUESTIONS_SHOWN}`
        : `${d.final.length} shown`;
    }
  }
}

// ============================================================
// buildTrace — assemble the 11 steps in pipeline order.
// ============================================================
export type TraceInputs = {
  original: string;
  lower: string;
  rules: RulesPass;
  merged: Arbitrated;
  llm: LlmOutcome | null;
  llmSignals: Signals | null;
  dropdownImpact: Impact;
  esc: {
    effective_impact: Impact;
    impact_escalated_from: Impact | null;
    narrower_than_selected: boolean;
  };
  confidenceInputs: ConfidenceDetail['inputs'];
  confidenceResult: ConfidenceDetail['result'];
  rulesSpans: EvidenceSpan[];
  llmVerified: EvidenceSpan[];
  llmDropped: EvidenceSpan[];
  finalEvidence: EvidenceSpan[];
  questionsBucket: BucketId;
  input: TriageInput;
  confidenceLow: boolean;
  llmExtraQuestion: string | null;
};

export function buildTrace(t: TraceInputs): Trace {
  const details: Record<(typeof TRACE.STEP_IDS)[number], unknown> = {
    normalize: explainNormalize(t.original, t.lower),
    rules_bucket: explainRulesBucket(t.lower, t.rules),
    llm_call: explainLlmCall(t.llm),
    arbitration: explainArbitration(t.merged),
    tiebreaks: explainTiebreaks(t.lower, t.rules),
    signals_merge: explainSignalsMerge(t.rules.signals, t.llmSignals),
    impact_escalation: explainImpactEscalation(t.dropdownImpact, t.merged.signals, t.lower, t.esc),
    severity: explainSeverity(t.esc.effective_impact, t.merged.signals, t.lower),
    confidence: explainConfidence(t.confidenceInputs, t.confidenceResult),
    evidence: explainEvidence(t.rulesSpans, t.llmVerified, t.llmDropped, t.finalEvidence),
    questions: explainQuestions(
      t.questionsBucket,
      t.input,
      t.merged.signals,
      t.confidenceLow,
      t.llmExtraQuestion,
    ),
  };

  const steps: TraceStep[] = TRACE.STEP_IDS.map((id) => ({
    id,
    summary: summarize(id, details[id]) ?? '',
    detail: details[id] as TraceStep['detail'],
  }));

  return {
    trace_schema_version: TRACE.TRACE_SCHEMA_VERSION,
    captured_at: new Date().toISOString(),
    verbose: true,
    steps,
  };
}
