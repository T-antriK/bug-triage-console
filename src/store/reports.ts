// ============================================================
// reports.ts — CRUD for TriageReport plus the status transitions.
// The _final fields are initialised equal to the computed fields at
// submit; overrides touch only the _final fields, so the original
// recommendation is always recoverable.
// ============================================================

import {
  ACTIVITY_ACTIONS,
  ACTORS,
  IDS,
  SCHEMA_VERSION,
  STORAGE_KEYS,
} from '../config';
import type {
  BucketId,
  PipelineResult,
  RoutingTeam,
  SeverityLevel,
  TriageInput,
  TriageReport,
} from '../types';
import { readCollection, writeCollection } from './storage';
import { log } from './activity';

export function readReports(): TriageReport[] {
  return readCollection<TriageReport>(STORAGE_KEYS.REPORTS);
}

export function writeReports(rows: TriageReport[]): void {
  writeCollection(STORAGE_KEYS.REPORTS, rows);
}

export function getReport(id: string): TriageReport | undefined {
  return readReports().find((r) => r.id === id);
}

export function nextReportId(rows: readonly TriageReport[]): string {
  const max = rows.reduce((acc, r) => {
    const n = Number(r.id.replace(IDS.REPORT_PREFIX, ''));
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return IDS.REPORT_PREFIX + String(max + 1).padStart(IDS.REPORT_PAD, '0');
}

// ---- empty computed block for a fresh draft ----
function emptyComputed(): Pick<
  TriageReport,
  | 'bucket'
  | 'secondary_tags'
  | 'severity'
  | 'confidence'
  | 'routing_suggestion'
  | 'evidence'
  | 'reason_chain'
  | 'next_questions'
  | 'signals'
  | 'escalations'
  | 'impact_escalated_from'
  | 'narrower_than_selected'
  | 'classifier_mode'
  | 'llm_provider'
  | 'llm_model'
  | 'llm_agreed'
  | 'rules_bucket'
  | 'llm_bucket'
  | 'llm_rationale'
  | 'bucket_final'
  | 'severity_final'
  | 'routing_final'
  | 'routing_other_text'
  | 'override_reason'
  | 'overridden_at'
  | 'was_overridden'
> {
  return {
    bucket: 'INFRA',
    secondary_tags: [],
    severity: 'Sev3',
    confidence: 'Low',
    routing_suggestion: 'Platform/Infra',
    evidence: [],
    reason_chain: [],
    next_questions: [],
    signals: {
      functional_loss: 'degraded',
      data_integrity: 'clean',
      data_loss_ongoing: false,
      exposure: 'none',
      exposure_prompt_level: false,
      silent_failure: false,
      outage_language: false,
    },
    escalations: [],
    impact_escalated_from: null,
    narrower_than_selected: false,
    classifier_mode: 'rules',
    llm_provider: null,
    llm_model: null,
    llm_agreed: null,
    rules_bucket: null,
    llm_bucket: null,
    llm_rationale: null,
    bucket_final: 'INFRA',
    severity_final: 'Sev3',
    routing_final: 'Platform/Infra',
    routing_other_text: null,
    override_reason: null,
    overridden_at: null,
    was_overridden: false,
  };
}

// ---- create / update draft ----
export function createDraft(input: TriageInput): TriageReport {
  const rows = readReports();
  const now = new Date().toISOString();
  const report: TriageReport = {
    id: nextReportId(rows),
    schema_version: SCHEMA_VERSION,
    created_at: now,
    updated_at: now,
    bug_report: input.bug_report,
    customer: input.customer,
    call_id: input.call_id,
    started_at: input.started_at,
    impact: input.impact,
    ...emptyComputed(),
    more_info: null,
    resolution_note: null,
    status: 'draft',
    submitted_at: null,
    routed_at: null,
    resolved_at: null,
  };
  rows.push(report);
  writeReports(rows);

  log({
    report_id: report.id,
    actor: ACTORS.USER,
    action: ACTIVITY_ACTIONS.REPORT_CREATED,
    field: 'bug_report',
    value_to: input.bug_report,
    detail: `report.created customer="${input.customer}" impact=${input.impact} call_id=${input.call_id ?? '-'}`,
  });
  return report;
}

export function updateDraft(id: string, input: TriageInput): TriageReport | undefined {
  const rows = readReports();
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return undefined;
  const now = new Date().toISOString();
  const prev = rows[i];

  // One log entry per field that actually changed, carrying the real
  // before/after values.
  const fields: Array<[string, string, string]> = [
    ['bug_report', prev.bug_report, input.bug_report],
    ['customer', prev.customer, input.customer],
    ['call_id', prev.call_id ?? '', input.call_id ?? ''],
    ['started_at', prev.started_at ?? '', input.started_at ?? ''],
    ['impact', prev.impact, input.impact],
  ];

  rows[i] = {
    ...prev,
    bug_report: input.bug_report,
    customer: input.customer,
    call_id: input.call_id,
    started_at: input.started_at,
    impact: input.impact,
    updated_at: now,
  };
  writeReports(rows);

  const changed = fields.filter(([, from, to]) => from !== to);
  if (changed.length === 0) {
    log({
      report_id: id,
      actor: ACTORS.USER,
      action: ACTIVITY_ACTIONS.DRAFT_SAVED,
      detail: 'report.draft_saved no field changes by=user',
    });
  } else {
    for (const [field, from, to] of changed) {
      log({
        report_id: id,
        actor: ACTORS.USER,
        action: ACTIVITY_ACTIONS.DRAFT_SAVED,
        field,
        value_from: from || null,
        value_to: to || null,
        detail: `report.draft_saved ${field} changed by=user`,
      });
    }
  }
  return rows[i];
}

// ---- more info: free text the user adds after seeing the prompts ----
export function updateMoreInfo(id: string, text: string): TriageReport | undefined {
  const rows = readReports();
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return undefined;
  const prev = rows[i];
  const next = text.trim() ? text : null;
  if ((prev.more_info ?? null) === (next ?? null)) return prev;

  const now = new Date().toISOString();
  rows[i] = { ...prev, more_info: next, updated_at: now };
  writeReports(rows);

  log({
    report_id: id,
    actor: ACTORS.USER,
    action: ACTIVITY_ACTIONS.MORE_INFO_UPDATED,
    field: 'more_info',
    value_from: prev.more_info,
    value_to: next,
    detail: 'more_info updated by=user',
  });
  return rows[i];
}

// ---- submit: run has already happened; merge the pipeline result ----
export function submitReport(
  id: string,
  result: PipelineResult,
  llmProvider: string | null,
  llmModel: string | null,
): TriageReport | undefined {
  const rows = readReports();
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return undefined;
  const now = new Date().toISOString();
  const prev = rows[i];

  const merged: TriageReport = {
    ...prev,
    impact: result.effective_impact,
    bucket: result.bucket,
    secondary_tags: result.secondary_tags,
    severity: result.severity,
    confidence: result.confidence,
    routing_suggestion: result.routing_suggestion,
    evidence: result.evidence,
    reason_chain: result.reason_chain,
    next_questions: result.next_questions,
    signals: result.signals,
    escalations: result.escalations,
    impact_escalated_from: result.impact_escalated_from,
    narrower_than_selected: result.narrower_than_selected,
    classifier_mode: result.classifier_mode,
    llm_provider: result.llm_provider ?? llmProvider,
    llm_model: result.llm_model ?? llmModel,
    llm_agreed: result.llm_agreed,
    rules_bucket: result.rules_bucket,
    llm_bucket: result.llm_bucket,
    llm_rationale: result.llm_rationale,
    // _final initialised equal to computed
    bucket_final: result.bucket,
    severity_final: result.severity,
    routing_final: result.routing_suggestion,
    routing_other_text: null,
    override_reason: null,
    overridden_at: null,
    was_overridden: false,
    status: 'in_review',
    submitted_at: now,
    updated_at: now,
  };
  rows[i] = merged;
  writeReports(rows);

  log({
    report_id: id,
    actor: ACTORS.USER,
    action: ACTIVITY_ACTIONS.SUBMITTED,
    detail: `report.submitted impact=${result.effective_impact}${
      result.impact_escalated_from ? ` escalated_from=${result.impact_escalated_from}` : ''
    }`,
  });
  log({
    report_id: id,
    actor: result.classifier_mode === 'rules' ? ACTORS.SYSTEM : ACTORS.LLM,
    action: ACTIVITY_ACTIONS.BUCKET_COMPUTED,
    field: 'bucket',
    value_to: result.bucket,
    detail: `bucket=${result.bucket} mode=${result.classifier_mode} rules=${
      result.rules_bucket ?? '-'
    } llm=${result.llm_bucket ?? '-'} agree=${result.llm_agreed ?? '-'}`,
    llm_rationale: result.llm_rationale,
  });
  log({
    report_id: id,
    actor: ACTORS.SYSTEM,
    action: ACTIVITY_ACTIONS.SEVERITY_COMPUTED,
    field: 'severity',
    value_to: result.severity,
    detail: `severity=${result.severity} impact=${result.effective_impact} functional=${result.signals.functional_loss} data=${result.signals.data_integrity} exposure=${result.signals.exposure} silent=${result.signals.silent_failure} outage=${result.signals.outage_language}`,
  });
  log({
    report_id: id,
    actor: ACTORS.SYSTEM,
    action: ACTIVITY_ACTIONS.CONFIDENCE_COMPUTED,
    field: 'confidence',
    value_to: result.confidence,
    detail: `confidence=${result.confidence} rules_top_score=${result.rules_top_score} evidence=${result.evidence.length} agree=${result.llm_agreed ?? '-'}`,
  });
  log({
    report_id: id,
    actor: ACTORS.SYSTEM,
    action: ACTIVITY_ACTIONS.ROUTING_COMPUTED,
    field: 'routing_suggestion',
    value_to: result.routing_suggestion,
    detail: `routing=${result.routing_suggestion} escalations=[${result.escalations.join('; ')}]`,
  });
  return merged;
}

// ---- override + route ----
export type OverrideInput = {
  bucket_final: BucketId;
  severity_final: SeverityLevel;
  routing_final: RoutingTeam;
  routing_other_text: string | null;
  override_reason: string | null;
};

export function routeReport(id: string, ov: OverrideInput): TriageReport | undefined {
  const rows = readReports();
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return undefined;
  const prev = rows[i];
  const now = new Date().toISOString();

  const changes: Array<{ field: string; from: string; to: string }> = [];
  if (ov.bucket_final !== prev.bucket) {
    changes.push({ field: 'bucket', from: prev.bucket, to: ov.bucket_final });
  }
  if (ov.severity_final !== prev.severity) {
    changes.push({ field: 'severity', from: prev.severity, to: ov.severity_final });
  }
  if (ov.routing_final !== prev.routing_suggestion) {
    changes.push({
      field: 'routing',
      from: prev.routing_suggestion,
      to: ov.routing_final,
    });
  }
  const wasOverridden = changes.length > 0;

  rows[i] = {
    ...prev,
    bucket_final: ov.bucket_final,
    severity_final: ov.severity_final,
    routing_final: ov.routing_final,
    routing_other_text: ov.routing_final === 'Other' ? ov.routing_other_text : null,
    override_reason: wasOverridden ? ov.override_reason : null,
    overridden_at: wasOverridden ? now : null,
    was_overridden: wasOverridden,
    status: 'routed',
    routed_at: now,
    updated_at: now,
  };
  writeReports(rows);

  for (const c of changes) {
    // value_from is the previous field value; value_to carries the full
    // override reason text (the thing a reader most needs); the field
    // transition itself is in `detail`.
    log({
      report_id: id,
      actor: ACTORS.USER,
      action: ACTIVITY_ACTIONS.OVERRIDE,
      field: c.field,
      value_from: c.from,
      value_to: ov.override_reason ?? c.to,
      detail: `override ${c.field} ${c.from}->${c.to} by=user`,
    });
  }
  const dest =
    ov.routing_final === 'Other' && ov.routing_other_text
      ? `${ov.routing_final} (${ov.routing_other_text})`
      : ov.routing_final;
  log({
    report_id: id,
    actor: ACTORS.USER,
    action: ACTIVITY_ACTIONS.ROUTED,
    field: 'routing_final',
    value_from: prev.routing_suggestion,
    value_to: dest,
    detail: `routed to=${dest} overridden=${wasOverridden}`,
  });
  return rows[i];
}

export function resolveReport(id: string, note: string): TriageReport | undefined {
  const rows = readReports();
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return undefined;
  const prev = rows[i];
  const now = new Date().toISOString();
  rows[i] = {
    ...prev,
    resolution_note: note,
    status: 'resolved',
    resolved_at: now,
    updated_at: now,
  };
  writeReports(rows);
  log({
    report_id: id,
    actor: ACTORS.USER,
    action: ACTIVITY_ACTIONS.RESOLVED,
    field: 'resolution_note',
    value_from: null,
    value_to: note,
    detail: `resolved routing_final=${prev.routing_final} severity_final=${prev.severity_final} by=user`,
  });
  return rows[i];
}

export function discardReport(id: string): void {
  const rows = readReports();
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return;
  const prev = rows[i];
  const now = new Date().toISOString();
  rows[i] = { ...prev, status: 'discarded', updated_at: now };
  writeReports(rows);
  log({
    report_id: id,
    actor: ACTORS.USER,
    action: ACTIVITY_ACTIONS.DISCARDED,
    field: 'status',
    value_from: prev.status,
    value_to: 'discarded',
    detail: `discarded from=${prev.status}`,
  });
}

// ---- bulk insert for seeding ----
export function insertMany(reports: TriageReport[]): void {
  const rows = readReports();
  writeReports([...rows, ...reports]);
}
