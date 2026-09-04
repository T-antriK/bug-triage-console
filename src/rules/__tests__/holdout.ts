/**
 * HOLD-OUT TEST SET — 30 cases
 *
 * Drop this at src/rules/__tests__/holdout.ts
 *
 * WHAT THIS IS FOR
 *   The 15 seeds live in the app and are visible while you tune. That makes them
 *   easy to overfit to without noticing. This set is deliberately phrased
 *   differently: different vocabulary, different sentence shapes, several cases
 *   with none of the keyword patterns present at all.
 *
 *   If the engine scores well here and on the seeds, the rules generalise.
 *   If it scores well on the seeds and badly here, they are pattern-matched.
 *
 * HOW TO USE IT
 *   Run against the rules-only pipeline first. That is the honest baseline.
 *   Then run with an LLM configured and compare. Group A should improve
 *   noticeably; the rest should stay roughly flat. If Group A does NOT improve
 *   with an LLM attached, either the prompt or the arbitration is broken.
 *
 * SCORING
 *   Bucket accuracy and severity accuracy are separate numbers. Report both.
 *   Getting the bucket right and the severity wrong is a different failure from
 *   getting the bucket wrong, and they have different fixes.
 *
 * KNOWN TUNING CASES
 *   H25 and H28 are expected to expose real gaps rather than pass first time.
 *   See the notes on those two.
 */

import type { BucketId, SeverityLevel, Impact, Confidence } from '../../types';

export type HoldoutCase = {
  id: string;
  bug_report: string;
  customer: string;
  call_id: string | null;
  impact: Impact;
  expected_bucket: BucketId;
  expected_severity: SeverityLevel;
  expected_confidence?: Confidence;   // only set where it is part of the assertion
  tests: string;                       // what this case is probing
};

export const HOLDOUT: HoldoutCase[] = [

  // ══════════════════════════════════════════════════════════════════
  // GROUP A — Messy phrasing, few or no keyword matches
  // These are where an LLM should earn its keep. Rules-only will likely
  // land Low confidence or miss. That is the expected result, not a bug.
  // ══════════════════════════════════════════════════════════════════

  {
    id: 'H01',
    bug_report: "The bot got confused about what the guy owed and wouldn't look it up.",
    customer: 'Northwind Credit',
    call_id: 'CALL-51002',
    impact: 'single',
    expected_bucket: 'LLM',
    expected_severity: 'Sev2',
    tests: 'Tool misuse described in plain speech. No pattern words. Customer-harm floor holds Sev2 on a single-caller report.',
  },
  {
    id: 'H02',
    bug_report: "Something's off with how it talks, customers keep asking it to repeat itself.",
    customer: 'Harbor Financial',
    call_id: null,
    impact: 'many',
    expected_bucket: 'TTS',
    expected_severity: 'Sev2',
    tests: 'Output-side audio problem with no TTS vocabulary. Must not be read as an LLM repetition loop.',
  },
  {
    id: 'H03',
    bug_report: "No notes are showing up on our end after calls finish, and nobody flagged an error.",
    customer: 'Meridian Lending',
    call_id: null,
    impact: 'many',
    expected_bucket: 'POST_CALL',
    expected_severity: 'Sev1',
    tests: 'Whether-vs-what tiebreak with no error language, so Post-call not Infra. Data floor plus silent modifier.',
  },
  {
    id: 'H04',
    bug_report: "It keeps going round in circles with people and they end up hanging up.",
    customer: 'Cascade Auto',
    call_id: 'CALL-51044',
    impact: 'many',
    expected_bucket: 'LLM',
    expected_severity: 'Sev2',
    tests: 'Reasoning loop described idiomatically. "Round in circles" matches nothing in the pattern tables.',
  },
  {
    id: 'H05',
    bug_report: "Callers with thick accents are having a rough time getting through the flow.",
    customer: 'Cascade Auto',
    call_id: null,
    impact: 'many',
    expected_bucket: 'STT',
    expected_severity: 'Sev2',
    tests: 'Recognition problem stated as a user-experience complaint.',
  },

  // ══════════════════════════════════════════════════════════════════
  // GROUP B — Bucket boundary traps
  // Each of these sits deliberately close to a neighbouring bucket.
  // ══════════════════════════════════════════════════════════════════

  {
    id: 'H06',
    bug_report: "The transcript looks perfect but customers say they couldn't make out what the agent said.",
    customer: 'Harbor Financial',
    call_id: 'CALL-51101',
    impact: 'many',
    expected_bucket: 'TTS',
    expected_severity: 'Sev2',
    tests: 'Direction rule. Transcript being clean rules out STT. The failure is on the way out.',
  },
  {
    id: 'H07',
    bug_report: "Audio playback is crystal clear, but the transcript has words the caller never said.",
    customer: 'Northwind Credit',
    call_id: 'CALL-51118',
    impact: 'many',
    expected_bucket: 'STT',
    expected_severity: 'Sev1',
    tests: 'Direction rule inverted. Clean audio does not mean clean recognition. Must not be read as an LLM hallucination.',
  },
  {
    id: 'H08',
    bug_report: "Getting 502s from our CRM sync endpoint and no call notes are landing anywhere.",
    customer: 'Meridian Lending',
    call_id: null,
    impact: 'many',
    expected_bucket: 'INFRA',
    expected_severity: 'Sev0',
    tests: 'Whether-vs-what: errors present, so Infra beats Post-call. Ongoing data loss at scale drives Sev0.',
  },
  {
    id: 'H09',
    bug_report: "Call notes are landing in Salesforce fine, but the summary text is from a different call.",
    customer: 'Meridian Lending',
    call_id: 'CALL-51150',
    impact: 'many',
    expected_bucket: 'POST_CALL',
    expected_severity: 'Sev1',
    tests: 'The other side of whether-vs-what. Delivery works, content is wrong. Cross-contaminated records are corruption.',
  },
  {
    id: 'H10',
    bug_report: "Agent tells callers the balance service is down, but our dashboard shows it healthy.",
    customer: 'Harbor Financial',
    call_id: 'CALL-51166',
    impact: 'many',
    expected_bucket: 'LLM',
    expected_severity: 'Sev2',
    tests: 'Tool misuse is reasoning. The API answered; the agent interpreted it wrong. Not Infra.',
  },
  {
    id: 'H11',
    bug_report: "Voice response has a 4 second delay from the very first turn of every call.",
    customer: 'Cascade Auto',
    call_id: 'CALL-51189',
    impact: 'many',
    expected_bucket: 'TTS',
    expected_severity: 'Sev2',
    tests: 'Latency-source rule. Constant from turn one rules out context growth, so not LLM.',
  },

  // ══════════════════════════════════════════════════════════════════
  // GROUP C — Severity floor traps
  // The bucket is easy. The severity is the test.
  // ══════════════════════════════════════════════════════════════════

  {
    id: 'H12',
    bug_report: "Recording uploads have been failing quietly for three days, storage writes return nothing.",
    customer: 'Platform-wide',
    call_id: null,
    impact: 'many',
    expected_bucket: 'INFRA',
    expected_severity: 'Sev0',
    tests: 'Ongoing loss at scale. Contrast with H13, which is loss that already finished.',
  },
  {
    id: 'H13',
    bug_report: "We lost yesterday's call summaries during the migration; everything since is writing fine.",
    customer: 'Platform-wide',
    call_id: null,
    impact: 'many',
    expected_bucket: 'POST_CALL',
    expected_severity: 'Sev1',
    tests: 'Data lost but not ongoing, so Sev1 not Sev0. This is the case data_loss_ongoing exists for.',
  },
  {
    id: 'H14',
    bug_report: "Refund amounts are being written to the CRM as negative values on some accounts.",
    customer: 'Harbor Financial',
    call_id: null,
    impact: 'many',
    expected_bucket: 'POST_CALL',
    expected_severity: 'Sev1',
    tests: 'Financial records floor. Set this floor to Sev0 in severity.ts if you want the more aggressive reading.',
  },
  {
    id: 'H15',
    bug_report: "The agent is telling every caller that non-payment will affect their immigration status.",
    customer: 'Northwind Credit',
    call_id: null,
    impact: 'many',
    expected_bucket: 'LLM',
    expected_severity: 'Sev0',
    tests: 'Legal exposure that is prompt-level ("every caller"), so it reproduces on every call. Sev0.',
  },
  {
    id: 'H16',
    bug_report: "One customer says the agent implied they would lose their home if they missed Friday.",
    customer: 'Meridian Lending',
    call_id: 'CALL-51231',
    impact: 'single',
    expected_bucket: 'LLM',
    expected_severity: 'Sev1',
    tests: 'Legal exposure floor lifting a single-caller report from Sev2 to Sev1. The headline case for the rubric.',
  },
  {
    id: 'H17',
    bug_report: "Agent reads the due date as the fifteenth when the record says the fifth.",
    customer: 'Cascade Auto',
    call_id: 'CALL-51255',
    impact: 'many',
    expected_bucket: 'TTS',
    expected_severity: 'Sev1',
    tests: 'Sounds cosmetic, is not. The customer acts on the wrong date. Output error severity scales with what the customer does with it.',
  },

  // ══════════════════════════════════════════════════════════════════
  // GROUP D — Single-caller reports
  // Guarding both directions: some escalate, most should not.
  // ══════════════════════════════════════════════════════════════════

  {
    id: 'H18',
    bug_report: "A caller was told their debt was already settled when the account shows it open.",
    customer: 'Northwind Credit',
    call_id: 'CALL-51280',
    impact: 'single',
    expected_bucket: 'LLM',
    expected_severity: 'Sev2',
    tests: 'Customer-harm floor holds at Sev2. Should not reach Sev1 without legal exposure.',
  },
  {
    id: 'H19',
    bug_report: "One call dropped mid-conversation. Has not happened again since.",
    customer: 'Harbor Financial',
    call_id: 'CALL-51291',
    impact: 'single',
    expected_bucket: 'INFRA',
    expected_severity: 'Sev2',
    tests: 'Infra bucket must not automatically imply high severity. Isolated and not recurring.',
  },
  {
    id: 'H20',
    bug_report: "One customer's surname is being mispronounced quite badly.",
    customer: 'Cascade Auto',
    call_id: 'CALL-51303',
    impact: 'single',
    expected_bucket: 'TTS',
    expected_severity: 'Sev3',
    tests: 'Genuinely cosmetic. Contrast with H17: a name is not a number the customer acts on.',
  },
  {
    id: 'H21',
    bug_report: "One caller's Spanish came through as gibberish in the transcript for the whole call.",
    customer: 'Meridian Lending',
    call_id: 'CALL-51318',
    impact: 'single',
    expected_bucket: 'STT',
    expected_severity: 'Sev2',
    tests: 'Single caller, fully broken. Base grid without any floor firing.',
  },

  // ══════════════════════════════════════════════════════════════════
  // GROUP E — Outage escalation from text
  // ══════════════════════════════════════════════════════════════════

  {
    id: 'H22',
    bug_report: "No outbound calls are connecting at all since this morning's deploy.",
    customer: 'Platform-wide',
    call_id: null,
    impact: 'many',
    expected_bucket: 'INFRA',
    expected_severity: 'Sev0',
    tests: 'Outage language escalates above the dropdown value.',
  },
  {
    id: 'H23',
    bug_report: "Auth tokens expired platform-wide and nothing works right now.",
    customer: 'Platform-wide',
    call_id: null,
    impact: 'outage',
    expected_bucket: 'INFRA',
    expected_severity: 'Sev0',
    tests: 'Outage short-circuit. The grid should never run; the reporter already made the call.',
  },
  {
    id: 'H24',
    bug_report: "All our numbers are dead, customers cannot reach anyone.",
    customer: 'Northwind Credit',
    call_id: null,
    impact: 'single',
    expected_bucket: 'INFRA',
    expected_severity: 'Sev0',
    tests: 'Dropdown says single, text describes an outage. Escalation must fire and impact_escalated_from must be set.',
  },

  // ══════════════════════════════════════════════════════════════════
  // GROUP F — Genuinely minor
  // Over-triage is a real failure mode. These guard against it.
  // ══════════════════════════════════════════════════════════════════

  {
    id: 'H25',
    bug_report: "Disposition code labels in the CSV export have a trailing space.",
    customer: 'Harbor Financial',
    call_id: null,
    impact: 'many',
    expected_bucket: 'POST_CALL',
    expected_severity: 'Sev3',
    tests: 'TUNING CASE. The silent-failure modifier will probably fire here and push this to Sev2, ' +
           'because there is no error and the words "disposition" and "export" look like write activity. ' +
           'The fix is a guard in severity.ts: the silent modifier should not apply when ' +
           'functional_loss is cosmetic. A trailing space is not silent damage, it is just untidy.',
  },
  {
    id: 'H26',
    bug_report: "The agent's greeting sounds a bit too upbeat for our brand voice.",
    customer: 'Cascade Auto',
    call_id: null,
    impact: 'many',
    expected_bucket: 'TTS',
    expected_severity: 'Sev3',
    tests: 'Cosmetic at scale is still Sev3. Blast radius alone must not escalate it.',
  },
  {
    id: 'H27',
    bug_report: "Transcripts capitalise our brand name inconsistently.",
    customer: 'Northwind Credit',
    call_id: null,
    impact: 'many',
    expected_bucket: 'STT',
    expected_severity: 'Sev3',
    tests: 'Cosmetic STT. Guards against every transcript issue defaulting to broken.',
  },

  // ══════════════════════════════════════════════════════════════════
  // GROUP G — Multi-symptom, ambiguous
  // These SHOULD return Low confidence. A confident answer here is the failure.
  // ══════════════════════════════════════════════════════════════════

  {
    id: 'H28',
    bug_report: "Calls are choppy and the agent repeats itself.",
    customer: 'Harbor Financial',
    call_id: 'CALL-51402',
    impact: 'many',
    expected_bucket: 'LLM',
    expected_severity: 'Sev2',
    expected_confidence: 'Low',
    tests: 'TUNING CASE, and the case study\'s own opening example. Two symptoms, two plausible owners. ' +
           'Rules will land LLM on "repeats" because "choppy" matches nothing. That is arguably wrong: ' +
           'choppy audio plus repetition usually means degraded transport, which is Infra. ' +
           'Either add "choppy", "cutting out", "breaking up" to the INFRA patterns and change the ' +
           'expectation to INFRA, or accept LLM and rely on Low confidence to force human review. ' +
           'Both are defensible. Pick one deliberately and say which in the writeup.',
  },
  {
    id: 'H29',
    bug_report: "After long calls the summary comes out truncated and the voice gets laggy near the end.",
    customer: 'Meridian Lending',
    call_id: 'CALL-51420',
    impact: 'many',
    expected_bucket: 'POST_CALL',
    expected_severity: 'Sev2',
    expected_confidence: 'Low',
    tests: 'Post-call and LLM both plausible. Precedence puts Post-call first. Confidence must drop and ' +
           'both candidate buckets must be shown in the UI.',
  },
  {
    id: 'H30',
    bug_report: "The webhook fired successfully but the agent also picked the wrong disposition code.",
    customer: 'Cascade Auto',
    call_id: 'CALL-51445',
    impact: 'many',
    expected_bucket: 'POST_CALL',
    expected_severity: 'Sev2',
    expected_confidence: 'Low',
    tests: 'Contains the word "webhook", which is an Infra pattern, but the webhook worked. ' +
           'Tests that negative context is respected rather than raw keyword hits winning.',
  },
];

// ════════════════════════════════════════════════════════════════════
// ANSWER KEY SUMMARY
//
//   Bucket distribution:  STT 5 | TTS 6 | LLM 6 | POST_CALL 7 | INFRA 6
//   Severity distribution: Sev0 5 | Sev1 7 | Sev2 13 | Sev3 5
//
//   Deliberately weighted toward Sev2 because that is where real queues sit,
//   and toward Post-call and Infra because that is where the boundary between
//   "whether it happened" and "what got written" causes the most misrouting.
//
// TARGETS
//   Rules-only:  bucket >= 22/30, severity >= 21/30
//   With LLM:    bucket >= 26/30, severity >= 24/30
//
//   Anything above 28/30 on the first run is worth being suspicious about.
//   Check you have not accidentally imported this file into the seed store.
// ════════════════════════════════════════════════════════════════════
