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
};

// what the LLM client returns to the pipeline
export type LlmOutcome =
  | { ok: true; pass: ClassificationPass }
  | { ok: false; failure: string };

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
