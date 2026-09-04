// ============================================================
// llm/prompt.ts — the extraction prompt.
// The system prompt embeds the bucket boundary rules and signal
// definitions imported verbatim from the rules files (never duplicated
// here), demands strict JSON, and states plainly that the model must
// NOT return a severity level.
// ============================================================

import { BUCKET_IDS } from '../config';
import type { TriageInput } from '../types';
import { BUCKETS } from '../rules/buckets';

const SIGNAL_DEFINITIONS = `
- functional_loss: "broken" (total loss of a function or materially wrong output) | "degraded" (works with a workaround) | "cosmetic" (minor, non-blocking)
- data_integrity: "clean" | "at_risk" (writes may be wrong) | "lost" (records missing, duplicated, or unrecoverable)
- data_loss_ongoing: true if data is still being lost right now, false if the incident already stopped
- exposure: "none" | "customer_harm" (customer may act on materially wrong info: money, identity, balances) | "legal" (threats, compliance breach, discrimination)
- exposure_prompt_level: true if the problem is reproducible on every call / baked into the system prompt, not a one-off generation
- silent_failure: true if no error surfaced and the call looked normal, so the damage accrues undetected
- outage_language: true if the text describes a service-level failure, not a single broken feature
`.trim();

function bucketBoundaries(): string {
  return BUCKET_IDS.map((id) => `- ${id}: ${BUCKETS[id].boundary}`).join('\n');
}

export const SYSTEM_PROMPT = `
You are the extraction step of a bug-triage pipeline for a production voice agent.
Your job is to read one messy bug report and return structured signals. A separate
rules engine converts your signals into a severity level.

You MUST NOT return a severity level. Severity is computed downstream from your signals.

Classify the report into exactly one bucket. The bucket answers "which layer of the
stack got it wrong":
${bucketBoundaries()}

Extract these seven signals:
${SIGNAL_DEFINITIONS}

Also return:
- secondary_tags: zero or more of ["data-loss","compliance","latency","regression","single-account","financial"]
- evidence: short exact substrings copied verbatim from the report, each tagged with what it supports (e.g. "bucket")
- rationale: ONE short keyword-dense line, no prose

Respond with a single JSON object and nothing else. No markdown, no code fences, no
commentary. Shape:
{
  "bucket": "STT|TTS|LLM|POST_CALL|INFRA",
  "secondary_tags": ["..."],
  "signals": {
    "functional_loss": "broken|degraded|cosmetic",
    "data_integrity": "clean|at_risk|lost",
    "data_loss_ongoing": true,
    "exposure": "none|customer_harm|legal",
    "exposure_prompt_level": false,
    "silent_failure": false,
    "outage_language": false
  },
  "evidence": [{ "supports": "bucket", "text": "exact substring from the report" }],
  "rationale": "one short keyword-dense line"
}
`.trim();

export function buildUserMessage(input: TriageInput): string {
  const lines = [
    `bug_report: ${input.bug_report}`,
    `customer: ${input.customer || '(none)'}`,
    `call_id: ${input.call_id ?? '(none)'}`,
    `started_at: ${input.started_at ?? '(none)'}`,
    `reporter_selected_impact: ${input.impact}`,
  ];
  return lines.join('\n');
}
