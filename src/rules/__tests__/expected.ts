// ============================================================
// expected.ts — the answer key.
// Asserts bucket and severity for all 15 seeds (section 10 of the
// spec) plus 6 adversarial cases of our own. If the engine disagrees
// with a row here, the fix goes in the rules, not in this file.
// ============================================================

import type { BucketId, SeverityLevel, TriageInput } from '../../types';

export type ExpectedRow = {
  bucket: BucketId;
  severity: SeverityLevel;
  why: string;
};

// Order matches SEED_INPUTS in src/store/seed.ts.
export const EXPECTED_SEEDS: readonly ExpectedRow[] = [
  { bucket: 'STT', severity: 'Sev1', why: 'Misrecognition causing a wrong downstream action' },
  { bucket: 'TTS', severity: 'Sev2', why: 'Output degraded, workaround exists' },
  { bucket: 'LLM', severity: 'Sev1', why: 'Legal exposure floor lifts a single-caller report' },
  { bucket: 'POST_CALL', severity: 'Sev1', why: 'Data floor plus silent-failure modifier' },
  { bucket: 'INFRA', severity: 'Sev0', why: 'Ongoing data loss at scale' },
  { bucket: 'LLM', severity: 'Sev2', why: 'Reasoning loop, degraded' },
  { bucket: 'STT', severity: 'Sev1', why: 'Direction rule: transcript, not audio' },
  { bucket: 'TTS', severity: 'Sev2', why: "Barge-in sits in TTS per the case study's own definition" },
  { bucket: 'INFRA', severity: 'Sev0', why: 'Outage language escalates above the dropdown' },
  { bucket: 'STT', severity: 'Sev2', why: 'Language detection, degraded' },
  { bucket: 'POST_CALL', severity: 'Sev1', why: 'Financial records floor plus silent modifier' },
  { bucket: 'LLM', severity: 'Sev2', why: 'Latency scaling with call length points at context growth' },
  { bucket: 'LLM', severity: 'Sev2', why: 'Tool misuse is reasoning, not infrastructure' },
  { bucket: 'INFRA', severity: 'Sev1', why: 'Data lost but not ongoing, so Sev1 not Sev0' },
  { bucket: 'TTS', severity: 'Sev1', why: 'Wrong stated amount is materially wrong output, not cosmetic' },
];

// ---- 6 adversarial cases, kept out of the seed store on purpose ----
export type AdversarialCase = {
  name: string;
  input: TriageInput;
  expected: ExpectedRow;
};

export const ADVERSARIAL: readonly AdversarialCase[] = [
  {
    name: 'working API, agent misuses the result',
    input: {
      bug_report:
        "The API returns a valid customer record but the agent then reads out the previous caller's balance instead. 200 OK on every lookup.",
      customer: 'Adversarial Co',
      call_id: 'CALL-90001',
      started_at: null,
      impact: 'many',
    },
    // tool_misuse_is_reasoning tiebreak keeps this in LLM, not INFRA;
    // customer_harm floor holds it at Sev2 from a many/degraded base.
    expected: { bucket: 'LLM', severity: 'Sev2', why: 'API answered; agent used it wrong' },
  },
  {
    name: 'systemic compliance breach baked into the prompt',
    input: {
      bug_report:
        'On every call the agent reads the old legal disclaimer we were told to remove for compliance. It is in the system prompt.',
      customer: 'Adversarial Co',
      call_id: null,
      started_at: null,
      impact: 'many',
    },
    // exposure=legal + exposure_prompt_level => compliance_systemic floor => Sev0.
    expected: { bucket: 'LLM', severity: 'Sev0', why: 'Legal + prompt-level => compliance_systemic floor' },
  },
  {
    name: 'constant latency from the first turn is not the LLM',
    input: {
      bug_report:
        'The audio greeting itself takes about 4 seconds to start playing, constant from the first turn on every call.',
      customer: 'Adversarial Co',
      call_id: 'CALL-90003',
      started_at: null,
      impact: 'many',
    },
    // latency_source tiebreak: constant-from-start + audio => TTS, not LLM.
    expected: { bucket: 'TTS', severity: 'Sev2', why: 'Constant latency from turn one points at TTS' },
  },
  {
    name: 'perfect transcript, agent ignores it',
    input: {
      bug_report:
        'Transcript looks perfect but the agent ignores what the caller said and follows its own script.',
      customer: 'Adversarial Co',
      call_id: 'CALL-90004',
      started_at: null,
      impact: 'many',
    },
    // "transcript" alone would pull STT; direction/reasoning keeps it LLM.
    expected: { bucket: 'LLM', severity: 'Sev2', why: 'Heard right, reasoned wrong' },
  },
  {
    name: 'delivered but content missing is Post-call, not Infra',
    input: {
      bug_report:
        'We see 200 OK on every webhook, the call completed fine, but no summary is attached to the synced contact.',
      customer: 'Adversarial Co',
      call_id: null,
      started_at: null,
      impact: 'many',
    },
    // whether_vs_what: no transport error, it is about WHAT got written => POST_CALL.
    // data_integrity lost ('no summary') => data_lost floor => Sev1.
    expected: { bucket: 'POST_CALL', severity: 'Sev1', why: 'Delivered, content missing => Post-call + data floor' },
  },
  {
    name: 'genuinely cosmetic, do not over-triage',
    input: {
      bug_report:
        "Cosmetic: the agent occasionally says 'uhh' before numbers and sounds a bit robotic, but callers understand fine.",
      customer: 'Adversarial Co',
      call_id: 'CALL-90006',
      started_at: null,
      impact: 'many',
    },
    // cosmetic signal + many => Sev3. Proves the floors do not fire on noise.
    expected: { bucket: 'TTS', severity: 'Sev3', why: 'Cosmetic base, no floor fires' },
  },
];
