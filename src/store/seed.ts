// ============================================================
// seed.ts — the 15 worked examples from BUILD_SPEC.md section 10.
// On first run (store empty + flag on) each one is put through the
// REAL pipeline in rules-only mode, stamped resolved, and backdated
// across the prior ten days. The outputs are never hardcoded: edit a
// rule, clear storage, reload, and the seeds change with it.
// ============================================================

import { ACTIVITY_ACTIONS, ACTORS, FEATURES, SCHEMA_VERSION } from '../config';
import type { TriageInput, TriageReport } from '../types';
import { classifyRulesOnly } from '../rules/pipeline';
import { log } from './activity';
import { insertMany, nextReportId, readReports } from './reports';

export const SEED_INPUTS: readonly TriageInput[] = [
  {
    bug_report:
      "Agent keeps hearing 'yes' as 'no' and sends people to collections escalation incorrectly.",
    customer: 'Northwind Credit',
    call_id: 'CALL-48219',
    started_at: null,
    impact: 'many',
  },
  {
    bug_report:
      "Customers say the voice sounds robotic and garbled, and they can't understand amounts.",
    customer: 'Harbor Financial',
    call_id: 'CALL-48377',
    started_at: null,
    impact: 'many',
  },
  {
    bug_report:
      "Agent told a customer they're going to be arrested if they don't pay today.",
    customer: 'Northwind Credit',
    call_id: 'CALL-48401',
    started_at: null,
    impact: 'single',
  },
  {
    bug_report:
      "Calls connect, but after the call we don't see notes in Salesforce and no summary is written.",
    customer: 'Meridian Lending',
    call_id: 'CALL-48455',
    started_at: null,
    impact: 'many',
  },
  {
    bug_report:
      "We're getting 500 errors on the /webhook/call-ended endpoint; nothing is saving.",
    customer: 'Platform-wide',
    call_id: null,
    started_at: null,
    impact: 'many',
  },
  {
    bug_report:
      'Agent repeats the same question in a loop even after the customer answers.',
    customer: 'Harbor Financial',
    call_id: 'CALL-48502',
    started_at: null,
    impact: 'many',
  },
  {
    bug_report: 'Audio is fine, but the transcript shows [inaudible] for half the call.',
    customer: 'Cascade Auto',
    call_id: 'CALL-48533',
    started_at: null,
    impact: 'many',
  },
  {
    bug_report:
      'The agent voice cuts off mid-sentence when the customer interrupts, barge-in seems broken.',
    customer: 'Meridian Lending',
    call_id: 'CALL-48588',
    started_at: null,
    impact: 'many',
  },
  {
    bug_report:
      "Outbound attempts show 'dialed' but the customer never receives a ring, carrier connect rate dropped to near zero.",
    customer: 'Platform-wide',
    call_id: null,
    started_at: null,
    impact: 'many',
  },
  {
    bug_report:
      "Agent misunderstands Spanish callers; keeps responding in English even when they ask '¿Habla español?'",
    customer: 'Cascade Auto',
    call_id: 'CALL-48610',
    started_at: null,
    impact: 'many',
  },
  {
    bug_report:
      'After successful payments, the system sometimes double-logs the payment event (duplicate transaction IDs).',
    customer: 'Harbor Financial',
    call_id: null,
    started_at: null,
    impact: 'many',
  },
  {
    bug_report:
      'On long calls, the voice response starts taking 8-12 seconds to speak back.',
    customer: 'Northwind Credit',
    call_id: 'CALL-48677',
    started_at: null,
    impact: 'many',
  },
  {
    bug_report:
      "Customer says they already paid; agent still insists they haven't and won't check, bad account lookup/tool use.",
    customer: 'Meridian Lending',
    call_id: 'CALL-48701',
    started_at: null,
    impact: 'single',
  },
  {
    bug_report:
      "We can't retrieve recordings for yesterday, storage shows 'file not found' for many call IDs.",
    customer: 'Platform-wide',
    call_id: null,
    started_at: null,
    impact: 'many',
  },
  {
    bug_report:
      "Agent reads the amount as 'one hundred twenty' when it should be 'one thousand twenty', number pronunciation is wrong.",
    customer: 'Cascade Auto',
    call_id: 'CALL-48744',
    started_at: null,
    impact: 'many',
  },
];

// Seeds are stamped `resolved`, so each carries a short plausible
// resolution note (aligned to SEED_INPUTS order). Editing a rule and
// reseeding still recomputes bucket/severity/etc from the pipeline —
// only these closing notes are fixed prose.
export const SEED_RESOLUTION_NOTES: readonly string[] = [
  'Root-caused to ASR confidence threshold too low for short utterances. Raised the yes/no confirmation threshold and added an explicit re-prompt. Fixed in release 4.12.',
  'TTS voice pack had drifted to an 8kHz sample rate after an infra change. Repinned to the 24kHz pack and added a synthesis QA check. Fixed in release 4.11.',
  'Collections script contained a non-compliant "arrest" line. Removed it from the prompt, added a blocklist test, and Legal signed off. Hotfixed same day.',
  'CRM webhook was firing before the summary job finished. Reordered the post-call pipeline so the summary is written first, then synced. Backfilled the affected calls.',
  'Storage node ran out of disk and the /webhook/call-ended handler was 500ing. Expanded the volume, added an alert at 80%, and replayed the dead-letter queue.',
  'Dialogue state machine did not mark the intent as satisfied when the answer arrived mid-prompt. Added barge-in acknowledgement. Fixed in release 4.12.',
  'Codec negotiation was falling back to a lossy profile for one carrier. Forced the wideband profile and the transcript quality recovered. Carrier ticket closed.',
  'Barge-in cutoff was cancelling the TTS stream without flushing the sentence buffer. Now finishes the current clause before yielding. Fixed in release 4.11.',
  'Carrier trunk was mis-provisioned after a migration and outbound calls never rang. Provider re-provisioned the SIP trunk; connect rate back to baseline.',
  'Language detection defaulted to en-US for this account instead of auto. Set language to auto-detect and confirmed Spanish routing. Config change, no deploy.',
  'Payment event handler was not idempotent under retry. Added an idempotency key on transaction ID and de-duplicated the existing double-logged rows.',
  'Context window was growing unbounded on long calls. Added a rolling summary at 20 turns; response latency is back under 2s. Fixed in release 4.13.',
  'Account-lookup tool was passing the wrong customer ref, so the agent argued from stale data. Fixed the tool call binding and added a lookup assertion in tests.',
  'Recording archive job had a stale mount and wrote to a detached volume. Remounted, re-ran the archive for the affected day, and added a mount health check.',
  'Number-to-speech formatter was reading digit groups instead of the whole value. Switched to the cardinal formatter for currency. Fixed in release 4.12.',
];

// Backdated timestamps: spread the 15 across the prior 10 days.
function backdatedISO(index: number, total: number): string {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const spanDays = 10;
  const offsetDays = spanDays - (index / Math.max(1, total - 1)) * spanDays;
  const jitterMs = ((index * 37) % 600) * 60 * 1000; // deterministic minute jitter
  return new Date(now - offsetDays * dayMs + jitterMs).toISOString();
}

export function buildSeedReports(): TriageReport[] {
  const out: TriageReport[] = [];
  let idCarrier: TriageReport[] = [];

  SEED_INPUTS.forEach((input, i) => {
    const result = classifyRulesOnly(input);
    const created = backdatedISO(i, SEED_INPUTS.length);
    const resolved = new Date(
      new Date(created).getTime() + 2 * 60 * 60 * 1000,
    ).toISOString();

    const id = nextReportId([...idCarrier]);
    const report: TriageReport = {
      id,
      schema_version: SCHEMA_VERSION,
      created_at: created,
      updated_at: resolved,
      bug_report: input.bug_report,
      customer: input.customer,
      call_id: input.call_id,
      started_at: input.started_at,
      impact: result.effective_impact,
      bucket: result.bucket,
      secondary_tags: result.secondary_tags,
      severity: result.severity,
      confidence: result.confidence,
      routing_suggestion: result.routing_suggestion,
      evidence: result.evidence,
      reason_chain: result.reason_chain,
      next_questions: result.next_questions,
      more_info: null,
      signals: result.signals,
      escalations: result.escalations,
      impact_escalated_from: result.impact_escalated_from,
      narrower_than_selected: result.narrower_than_selected,
      classifier_mode: result.classifier_mode,
      llm_provider: null,
      llm_model: null,
      llm_agreed: null,
      rules_bucket: result.rules_bucket,
      llm_bucket: null,
      llm_rationale: null,
      rules_matched_patterns: result.rules_matched_patterns,
      llm_spans_dropped: result.llm_spans_dropped,
      bucket_final: result.bucket,
      severity_final: result.severity,
      routing_final: result.routing_suggestion,
      routing_other_text: null,
      override_reason: null,
      overridden_at: null,
      was_overridden: false,
      status: 'resolved',
      submitted_at: created,
      routed_at: resolved,
      resolved_at: resolved,
      resolution_note: SEED_RESOLUTION_NOTES[i] ?? null,
    };
    out.push(report);
    idCarrier = [...idCarrier, report];
  });

  return out;
}

export function seedIfEmpty(): void {
  if (!FEATURES.SEED_DATA_ENABLED) return;
  if (readReports().length > 0) return;

  const seeds = buildSeedReports();
  insertMany(seeds);
  log({
    actor: ACTORS.SYSTEM,
    action: ACTIVITY_ACTIONS.SEED_LOADED,
    detail: `seed.loaded count=${seeds.length} mode=rules`,
  });
}
