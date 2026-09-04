/**
 * WHAT THIS DOES
 * Reads the seven severity signals out of the report text using keyword
 * tables. Every signal has one sentence saying what it means. severity.ts
 * turns these seven values into a Sev level; it never looks at the raw
 * text itself.
 *
 * HOW TO CHANGE IT
 * Each signal is a keyword array below. Add or remove phrases to change
 * when the signal fires. `functional_loss` and `data_integrity` are
 * three-way: the "worse" table is checked first, then the "milder" one,
 * then a conservative default. `silent_failure` is special and explained
 * at its table.
 *
 * WHY IT WORKS THIS WAY
 * Splitting extraction (here) from scoring (severity.ts) means the Sev
 * grid stays a tiny readable function, and the messy "what words imply
 * what" work lives in flat lists a non-programmer can edit. Under-triage
 * costs more than over-triage in a system with a human confirm step, so
 * the defaults lean toward the middle, never toward "cosmetic / clean".
 */

import type { Signals } from '../types';
import { hasAny, matched } from './normalize';

export const SIGNAL_PATTERNS = {
  // Data is unrecoverable or wrong at rest: writes lost, dupes, missing records.
  data_integrity_lost: [
    'not saving',
    'nothing is saving',
    'file not found',
    'no summary',
    'summary is missing',
    'notes are missing',
    'not populated',
    'never gets populated',
    'duplicate',
    'double-log',
    'double-logs',
    'lost',
    "can't retrieve",
    'cannot retrieve',
    'cant retrieve',
    // Iteration 2
    'summaries',
    'lost yesterday',
    'return nothing',
    'returns nothing',
    'not landing',
    'landing anywhere',
    'from a different call',
  ],

  // Still losing data right now, as opposed to a past incident already stopped.
  data_loss_ongoing: [
    'nothing is saving',
    'not saving',
    'still failing',
    'still happening',
    'ongoing',
    'continues to',
    'every call today',
    'right now',
    // Iteration 2 — "this is still going" phrased with a duration
    'for three days',
    'for days',
    'failing quietly',
    'quietly for',
    'have been failing',
    'has been failing',
    'since this morning',
  ],

  // Legal / regulatory exposure: threats, compliance breaches, discrimination.
  exposure_legal: [
    'arrested',
    'threatened',
    'legal action',
    'lawsuit',
    ' sue ',
    'harass',
    'discriminat',
    'regulator',
    'compliance violation',
    'disclaimer we were told to remove',
    'told to remove for compliance',
    // Iteration 2 — coercive threats that carry legal / regulatory weight
    'immigration status',
    'deport',
    'lose their home',
    'lose your home',
    'lose their house',
    'repossess',
    'foreclos',
    'affect their credit',
    'credit score',
  ],

  // Customer could act on materially wrong information (money, identity, balances).
  exposure_customer_harm: [
    'wrong amount',
    'already paid',
    'incorrect balance',
    'wrong balance',
    'wrong account',
    "previous caller's balance",
    'previous caller balance',
    'reads the amount',
    'collections',
    'overcharge',
    'charged twice',
    // Iteration 2
    'already settled',
    'debt was already',
    'was told their',
    'balance service is down',
    'negative values',
  ],

  // Reproducible on every call / baked into the prompt, not a one-off generation.
  exposure_prompt_level: [
    'every call',
    'every single call',
    'all calls',
    'on every call',
    'always says',
    'system prompt',
    'in the prompt',
    'this morning the agent says',
  ],

  // Text describes a service-level failure, not a single broken feature.
  outage_language: [
    'connect rate',
    'near zero',
    'all calls are',
    'nothing works',
    'complete failure',
    'service outage',
    'no calls are connecting',
    'carrier connect',
    'never receives a ring',
    'dialed but',
    // Iteration 2 — "the whole thing is down" said plainly
    'no outbound calls are connecting',
    'not connecting at all',
    'connecting at all',
    'numbers are dead',
    'cannot reach anyone',
    "can't reach anyone",
    'nothing works right now',
  ],

  // Something DID surface an error — used to rule silent_failure OUT.
  silent_failure_absent: [
    ' error',
    'errors',
    '500',
    '502',
    '503',
    '5xx',
    'alert',
    'alerted',
    'exception',
    'crash',
    'stack trace',
    'failed loudly',
  ],

  // Normal-looking write path that we now suspect — used to rule silent_failure IN.
  silent_failure_present: [
    'saving',
    'logged',
    'logs',
    'written',
    'wrote',
    'writes',
    'notes',
    'summary',
    'recorded',
    'disposition',
    'looked normal',
    'call looked fine',
  ],

  // Total loss of a function or materially wrong output.
  functional_broken: [
    'wrong',
    'incorrect',
    'incorrectly',
    'inaudible',
    'completely broken',
    'complete failure',
    'not working at all',
    "doesn't work at all",
    'unusable',
    'no longer works',
    'totally broken',
    // Iteration 2 — output that contradicts the source of truth, or a
    // call that did not survive, is broken not merely degraded
    'when the record says',
    'when the account shows',
    'when the system shows',
    'when the record',
    'call dropped',
    'dropped mid',
    'gibberish',
  ],

  // Small, non-blocking imperfection with an easy workaround.
  functional_cosmetic: [
    'slightly',
    'minor',
    'cosmetic',
    'occasionally',
    'sounds a bit',
    'a little',
    'tiny',
    'nitpick',
    'understand fine',
    // Iteration 2 — tidiness issues, not damage
    'trailing space',
    'inconsistently',
    'capitalise',
    'capitalization',
    'brand voice',
  ],
} as const;

export const SIGNAL_DEFAULTS: Signals = {
  functional_loss: 'degraded', // conservative middle when nothing matches
  data_integrity: 'clean',
  data_loss_ongoing: false,
  exposure: 'none',
  exposure_prompt_level: false,
  silent_failure: false,
  outage_language: false,
};

/**
 * silent_failure is true when NO pattern from silent_failure_absent matches
 * AND at least one from silent_failure_present does.
 * Loud failures are bounded by how fast you notice them; silent ones are
 * bounded by nothing.
 */
function readSilentFailure(lower: string): boolean {
  const loud = hasAny(lower, SIGNAL_PATTERNS.silent_failure_absent);
  const normalWritePath = hasAny(lower, SIGNAL_PATTERNS.silent_failure_present);
  return !loud && normalWritePath;
}

export function extractSignals(lower: string): Signals {
  const functional_loss: Signals['functional_loss'] = hasAny(
    lower,
    SIGNAL_PATTERNS.functional_broken,
  )
    ? 'broken'
    : hasAny(lower, SIGNAL_PATTERNS.functional_cosmetic)
      ? 'cosmetic'
      : SIGNAL_DEFAULTS.functional_loss;

  const data_integrity: Signals['data_integrity'] = hasAny(
    lower,
    SIGNAL_PATTERNS.data_integrity_lost,
  )
    ? 'lost'
    : SIGNAL_DEFAULTS.data_integrity;

  const exposure: Signals['exposure'] = hasAny(lower, SIGNAL_PATTERNS.exposure_legal)
    ? 'legal'
    : hasAny(lower, SIGNAL_PATTERNS.exposure_customer_harm)
      ? 'customer_harm'
      : SIGNAL_DEFAULTS.exposure;

  return {
    functional_loss,
    data_integrity,
    data_loss_ongoing: hasAny(lower, SIGNAL_PATTERNS.data_loss_ongoing),
    exposure,
    exposure_prompt_level: hasAny(lower, SIGNAL_PATTERNS.exposure_prompt_level),
    silent_failure: readSilentFailure(lower),
    outage_language: hasAny(lower, SIGNAL_PATTERNS.outage_language),
  };
}

/** Which keywords fired for a given signal — used by evidence.ts. */
export function signalMatches(lower: string, key: keyof typeof SIGNAL_PATTERNS): string[] {
  return matched(lower, SIGNAL_PATTERNS[key]);
}
