// ============================================================
// src/types.ts — every TypeScript type in the app. No `any`, ever.
// ============================================================

import type {
  IMPACT_OPTIONS,
  BUCKET_IDS,
  SEVERITY_LEVELS,
  ROUTING_TEAMS,
  CONFIDENCE_LEVELS,
  REPORT_STATUSES,
  LLM_PROVIDERS,
  TRACE,
} from './config';

export type Impact = (typeof IMPACT_OPTIONS)[number];
export type BucketId = (typeof BUCKET_IDS)[number];
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];
export type RoutingTeam = (typeof ROUTING_TEAMS)[number];
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];
export type ReportStatus = (typeof REPORT_STATUSES)[number];

// ---- the 7 severity signals ----
export type Signals = {
  functional_loss: 'broken' | 'degraded' | 'cosmetic';
  data_integrity: 'clean' | 'at_risk' | 'lost';
  data_loss_ongoing: boolean; // still losing data right now vs already lost
  exposure: 'none' | 'customer_harm' | 'legal';
  exposure_prompt_level: boolean; // reproducible on every call, not a one-off
  silent_failure: boolean; // no error surfaced, caller experience normal
  outage_language: boolean; // text describes service-level failure
};

// ---- evidence ----
export type EvidenceSupport =
  | 'bucket'
  | 'severity.functional_loss'
  | 'severity.data_integrity'
  | 'severity.data_loss_ongoing'
  | 'severity.exposure'
  | 'severity.exposure_prompt_level'
  | 'severity.silent_failure'
  | 'severity.outage_language'
  | 'impact';

export type EvidenceProvenance = 'rules' | 'llm' | 'both';

export type EvidenceSpan = {
  field: 'bug_report';
  text: string;
  start: number;
  end: number;
  supports: EvidenceSupport;
  provenance?: EvidenceProvenance; // absent on spans from reports predating Iteration 3
};

// ---- classifier provenance ----
export type ClassifierMode = 'rules' | 'llm' | 'hybrid';

// ---- the record ----
export type TriageReport = {
  // ---- identity ----
  id: string; // 'RPT-0001', zero-padded, sequential
  schema_version: number;
  created_at: string; // ISO 8601
  updated_at: string;

  // ---- input fields (editable in draft only) ----
  bug_report: string;
  customer: string;
  call_id: string | null;
  started_at: string | null; // date only, 'YYYY-MM-DD' (no time component anywhere)
  impact: Impact;

  // ---- computed at submit ----
  bucket: BucketId;
  secondary_tags: string[];
  severity: SeverityLevel;
  confidence: Confidence;
  routing_suggestion: RoutingTeam;
  evidence: EvidenceSpan[];
  reason_chain: string[]; // human-readable severity derivation
  next_questions: string[]; // shown in the UI as "Prompts for more info"; field name unchanged
  signals: Signals; // the 7 inputs to severity
  escalations: string[]; // e.g. 'Page on-call', 'Notify Legal'
  impact_escalated_from: Impact | null; // set if text overrode the dropdown
  narrower_than_selected: boolean; // text reads narrower than the dropdown; flagged, not downgraded

  // ---- free text the user adds after seeing the prompts (Iteration 2) ----
  more_info: string | null; // optional; editable in in_review, disabled from routed on
  resolution_note: string | null; // mandatory at Mark as resolved

  // ---- classifier provenance ----
  classifier_mode: ClassifierMode;
  llm_provider: string | null;
  llm_model: string | null;
  llm_agreed: boolean | null; // did LLM and rules pick the same bucket
  rules_bucket: BucketId | null; // kept separately for the disagreement view
  llm_bucket: BucketId | null;
  llm_rationale: string | null;
  rules_matched_patterns: string[] | null; // patterns that fired for the rules bucket
  llm_spans_dropped: number | null; // LLM evidence spans the substring guard rejected

  // ---- human override ----
  bucket_final: BucketId;
  severity_final: SeverityLevel;
  routing_final: RoutingTeam;
  routing_other_text: string | null;
  override_reason: string | null;
  overridden_at: string | null;
  was_overridden: boolean;

  // ---- lifecycle ----
  status: ReportStatus;
  submitted_at: string | null;
  routed_at: string | null;
  resolved_at: string | null;

  // ---- bulk import provenance ----
  import_source: string | null; // filename of the CSV this came from; null for form-created

  // ---- verbose mode (Iteration 5) ----
  has_trace: boolean; // a full decision trace exists under STORAGE_KEYS.TRACES for this id
};

// ---- activity log ----
export type Actor = 'system' | 'user' | 'llm';

export type ActivityEntry = {
  id: string; // 'LOG-000001'
  timestamp: string; // ISO 8601
  report_id: string | null;
  actor: Actor;
  action: string; // 'report.created', 'severity.computed', ...
  field: string | null;
  value_from: string | null;
  value_to: string | null;
  detail: string; // keyword-dense
  llm_rationale: string | null;
};

// ---- feedback ----
export type FeedbackEntry = {
  id: string; // 'FB-0001'
  timestamp: string;
  to: string;
  body: string;
};

// ---- settings (localStorage) ----
export type Provider = keyof typeof LLM_PROVIDERS; // anthropic | openai | gemini | kimi | none
export type ProviderShape = (typeof LLM_PROVIDERS)[Provider]['shape']; // anthropic | openai | gemini | none

export type Settings = {
  provider: Provider;
  model: string | null;
  apiKey: string;
  verbose: boolean; // runtime toggle for verbose mode (Iteration 5)
};

// ============================================================
// Pipeline-internal shapes (not persisted directly on the report)
// ============================================================

// input to the whole pipeline
export type TriageInput = {
  bug_report: string;
  customer: string;
  call_id: string | null;
  started_at: string | null;
  impact: Impact;
};

// output of a single classification pass (rules OR llm)
export type ClassificationPass = {
  bucket: BucketId | null; // null = this method abstained
  bucketScores: Record<BucketId, number>; // rules fills this; llm leaves zeros
  topScore: number;
  signals: Signals;
  secondary_tags: string[];
  evidence: EvidenceSpan[];
  rationale: string | null;
};

// merged result after arbitrate()
export type Arbitrated = {
  bucket: BucketId;
  rules_bucket: BucketId | null;
  llm_bucket: BucketId | null;
  llm_agreed: boolean | null;
  classifier_mode: ClassifierMode;
  bucketScores: Record<BucketId, number>;
  topScore: number;
  signals: Signals;
  secondary_tags: string[];
  evidence: EvidenceSpan[];
  llm_rationale: string | null;
  // how the bucket was chosen — additive, does not affect any value above
  decision: ArbitrationDetail['rule'];
  decision_detail: string;
  contenders: BucketId[];
  tiebreak_ran: boolean;
  tiebreak_via: string | null;
};

export type SeverityResult = {
  level: SeverityLevel;
  reasons: string[];
};

export type RoutingResult = {
  team: RoutingTeam;
  check: string;
  escalations: string[];
};

// the full pipeline output, merged onto a report at submit
export type PipelineResult = {
  bucket: BucketId;
  secondary_tags: string[];
  severity: SeverityLevel;
  confidence: Confidence;
  routing_suggestion: RoutingTeam;
  evidence: EvidenceSpan[];
  reason_chain: string[];
  next_questions: string[];
  signals: Signals;
  escalations: string[];
  impact_escalated_from: Impact | null;
  narrower_than_selected: boolean;
  effective_impact: Impact;
  rules_top_score: number;
  classifier_mode: ClassifierMode;
  llm_provider: string | null;
  llm_model: string | null;
  llm_agreed: boolean | null;
  rules_bucket: BucketId | null;
  llm_bucket: BucketId | null;
  llm_rationale: string | null;
  rules_matched_patterns: string[] | null;
  llm_spans_dropped: number;
  // Populated only when a trace was requested (verbose mode). Never
  // influences any field above it — pure observation.
  trace: Trace | null;
};

// what the LLM client returns to the pipeline
export type LlmOutcome =
  | { ok: true; pass: ClassificationPass; debug?: LlmCallDebug }
  | { ok: false; failure: string; debug?: LlmCallDebug };

// ============================================================
// DECISION TRACE (verbose mode, Iteration 5)
// Everything here is observation. It is captured only when verbose is
// on, guarded at the call site, and never feeds back into a decision.
// ============================================================

export type TraceStepId = (typeof TRACE.STEP_IDS)[number];

export type KeywordHit = { keyword: string; index: number };
export type KeywordPenalty = { keyword: string; penalty: number };

export type NormalizeDetail = {
  original: string;
  normalised: string;
  changes: string[]; // human-readable list of transformations that applied
};

export type BucketScoreRow = {
  bucket: BucketId;
  score: number; // net score, floored at 0
  raw_score: number; // before the floor
  hits: KeywordHit[];
  negatives: KeywordPenalty[];
};

export type RulesBucketDetail = {
  per_bucket: BucketScoreRow[];
  ranking: BucketId[]; // buckets that scored, highest first
  contenders: BucketId[]; // buckets a boundary rule was allowed to speak for
  picked: BucketId | null;
  via: 'tiebreak' | 'score' | 'precedence' | 'abstain';
  via_detail: string; // e.g. "tiebreak: direction" or "highest score" or "abstained, no keyword hit"
};

export type LlmCallDebug = {
  provider: string;
  model: string | null;
  endpoint: string;
  latency_ms: number;
  http_status: number | null; // null when the fetch threw before a response
  raw_body: string; // truncated to TRACE.RAW_BODY_MAX_CHARS; never contains the key
  fields_kept: string[];
  fields_dropped: Array<{ field: string; reason: string }>;
  failure: string | null; // the LLM_FAILURES reason, or null on success
};

export type LlmCallDetail =
  | { skipped: true; reason: string }
  | ({ skipped: false } & LlmCallDebug);

export type ArbitrationDetail = {
  rules_bucket: BucketId | null;
  llm_bucket: BucketId | null;
  agreed: boolean | null;
  winner: BucketId;
  rule:
    | 'agreed'
    | 'model_leads_on_disagreement'
    | 'tiebreak'
    | 'single_method'
    | 'fallback';
  rule_detail: string;
};

export type TiebreakEvalRow = {
  name: string;
  plain_english: string;
  fired: boolean;
  picked: BucketId | null;
};

export type TiebreaksDetail = {
  ran: boolean;
  not_run_reason: string | null;
  contenders: BucketId[];
  evaluated: TiebreakEvalRow[];
};

export type SignalMergeRow = {
  signal: keyof Signals;
  rules_value: string;
  llm_value: string | null;
  merged: string;
  source: 'rules' | 'llm' | 'equal';
};

export type SignalsMergeDetail = {
  llm_present: boolean;
  per_signal: SignalMergeRow[];
};

export type ImpactEscalationDetail = {
  dropdown: Impact;
  effective: Impact;
  escalated: boolean;
  escalated_from: Impact | null;
  trigger_keywords: string[]; // outage_language keywords that fired
  narrower_flag: boolean;
  narrower_keywords: string[];
};

export type SeverityFloorRow = {
  id: string;
  condition: string; // plain-English condition text from the rules table
  signal_values: Record<string, string>; // the values the condition evaluated against
  fired: boolean;
  floor_level: SeverityLevel;
  level_after: SeverityLevel;
};

export type SeverityDetail = {
  impact: Impact;
  short_circuit: boolean;
  short_circuit_reason: string | null;
  base: { radius: 'many' | 'single'; functional_loss: string; cell: SeverityLevel } | null;
  floors: SeverityFloorRow[];
  silent_modifier: {
    silent_failure: boolean;
    gate_passed: boolean; // data_integrity !== 'clean' || functional_loss === 'broken'
    applied: boolean;
    level_before: SeverityLevel;
    level_after: SeverityLevel;
    cap: SeverityLevel;
  };
  final_level: SeverityLevel;
};

export type ConfidenceDetail = {
  branch: string; // which line of the confidence table was taken
  inputs: {
    mode: string;
    rules_bucket: BucketId | null;
    llm_bucket: BucketId | null;
    llm_failed: boolean;
    rules_top_score: number;
    evidence_verified_count: number;
  };
  result: Confidence;
};

export type EvidenceDetail = {
  rules_spans: Array<{ text: string; supports: string }>;
  llm_spans_verified: Array<{ text: string; supports: string }>;
  llm_spans_dropped: Array<{ text: string; reason: string }>;
  merge_decisions: string[]; // human-readable notes: kept, dropped-as-overlap, promoted-to-both
  final_count: number;
};

export type QuestionsDetail = {
  bucket: BucketId;
  base_bank: string[];
  conditionals_fired: Array<{ ask: string; why: string }>;
  llm_extra: string | null;
  before_cap: string[];
  cut_by_cap: string[];
  final: string[];
};

export type TraceStepDetail =
  | NormalizeDetail
  | RulesBucketDetail
  | LlmCallDetail
  | ArbitrationDetail
  | TiebreaksDetail
  | SignalsMergeDetail
  | ImpactEscalationDetail
  | SeverityDetail
  | ConfidenceDetail
  | EvidenceDetail
  | QuestionsDetail;

export type TraceStep = {
  id: TraceStepId;
  summary: string; // the one-line collapsed view
  detail: TraceStepDetail;
};

export type Trace = {
  trace_schema_version: number;
  captured_at: string; // ISO 8601
  verbose: true;
  steps: TraceStep[];
};

export type StoredTrace = {
  report_id: string;
  captured_at: string;
  trace: Trace;
};

// eval harness row
export type EvalRow = {
  seedIndex: number;
  bug_report: string;
  expectedBucket: BucketId;
  expectedSeverity: SeverityLevel;
  actualBucket: BucketId;
  actualSeverity: SeverityLevel;
  bucketPass: boolean;
  severityPass: boolean;
  pass: boolean;
};
