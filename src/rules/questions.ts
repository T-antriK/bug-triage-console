/**
 * WHAT THIS DOES
 * Produces the "next questions" list for a report: a fixed base bank per
 * bucket, plus conditional questions that fire when key input is missing
 * or a signal is set. The list is capped at VALIDATION.MAX_QUESTIONS_SHOWN.
 *
 * HOW TO CHANGE IT
 * Edit the arrays in QUESTIONS to change the per-bucket base set. Edit
 * CONDITIONAL_QUESTIONS to change what extra questions appear and when.
 * The LLM may contribute at most one extra question; the base set is
 * deterministic so the list never degrades when the model is off or wrong.
 *
 * WHY IT WORKS THIS WAY
 * The questions are the cheapest way to move a vague report toward a
 * routable one. Keeping them deterministic means a reviewer sees the
 * same solid checklist every time, model or no model.
 */

import type { BucketId, Signals, TriageInput } from '../types';
import { VALIDATION } from '../config';

export const QUESTIONS: Record<BucketId, readonly string[]> = {
  STT: [
    'Can you share 2-3 Call IDs where this reproduced?',
    'What language and accent was the caller using?',
    'Is this specific to certain phrases or vocabulary?',
    'Does the audio recording sound clear on playback?',
    'What share of calls with this caller profile are affected?',
  ],
  TTS: [
    'Can you share a Call ID and a timestamp within the call?',
    'Which specific words or number formats come out wrong?',
    'Is it consistent or intermittent for the same input?',
    'Which voice model or config is this account on?',
  ],
  LLM: [
    'Can you share the full transcript for one affected call?',
    'What was the agent supposed to do at that point?',
    'Does it reproduce on a fresh call with the same input?',
    'How far into the call does it happen?',
    'Was there a recent prompt or config change on this account?',
  ],
  POST_CALL: [
    'Which downstream records are missing or wrong?',
    'Did the call itself complete normally?',
    'How far back does this go, and when was the last good write?',
    'Is this all calls for the account or a subset?',
    'Are the source transcripts still available for a backfill?',
  ],
  INFRA: [
    'What is the exact error message and status code?',
    'When did the first failure occur?',
    'Is this isolated to one account or platform-wide?',
    'Are there correlated alerts in monitoring?',
    'Has anything deployed or changed in that window?',
  ],
};

type ConditionalQuestion = {
  ask: string;
  why: string; // plain-English trigger, shown in the verbose trace
  when: (input: TriageInput, signals: Signals, confidenceLow: boolean) => boolean;
};

export const CONDITIONAL_QUESTIONS: readonly ConditionalQuestion[] = [
  {
    ask: 'Do you have a Call ID we can trace?',
    why: 'no call_id on the report',
    when: (input) => !input.call_id,
  },
  {
    ask: 'When did this first start?',
    why: 'no started_at on the report',
    when: (input) => !input.started_at,
  },
  {
    ask: 'Roughly how many records are affected, and are the sources still available?',
    why: "data_integrity is not 'clean'",
    when: (_input, s) => s.data_integrity !== 'clean',
  },
  {
    ask: 'Is this in the system prompt, meaning all calls, or a one-off generation?',
    why: "exposure is 'legal'",
    when: (_input, s) => s.exposure === 'legal',
  },
  {
    ask: 'Can you paste the raw customer message verbatim?',
    why: 'confidence is Low',
    when: (_input, _s, confidenceLow) => confidenceLow,
  },
];

/**
 * Base bank first, then any conditionals that apply, de-duplicated,
 * capped. `llmExtra` is an optional single question from the model.
 */
export function buildQuestions(
  bucket: BucketId,
  input: TriageInput,
  signals: Signals,
  confidenceLow: boolean,
  llmExtra?: string | null,
): string[] {
  const ordered: string[] = [...QUESTIONS[bucket]];

  for (const c of CONDITIONAL_QUESTIONS) {
    if (c.when(input, signals, confidenceLow)) ordered.push(c.ask);
  }

  if (llmExtra && llmExtra.trim()) ordered.push(llmExtra.trim());

  const seen = new Set<string>();
  const deduped = ordered.filter((q) => {
    if (seen.has(q)) return false;
    seen.add(q);
    return true;
  });

  return deduped.slice(0, VALIDATION.MAX_QUESTIONS_SHOWN);
}
