/**
 * WHAT THIS DOES
 * The impact dropdown on the form is a floor, not a ceiling. This step
 * lets the report text raise it — never silently lower it. If the text
 * uses outage language, impact becomes "outage" and the report carries a
 * visible note. If the text reads narrower than the dropdown claims, the
 * report is flagged for a human, not downgraded.
 *
 * HOW TO CHANGE IT
 * The outage trigger is the `outage_language` signal (edit its keyword
 * table in signals.ts). The "narrower than claimed" phrases are the
 * NARROWER_PHRASES list below.
 *
 * WHY IT WORKS THIS WAY
 * Quietly demoting someone's ticket is how a triage tool loses the trust
 * of the people feeding it. Raising is safe because a human still
 * confirms; lowering is not, so we only ever flag it.
 */

import type { Impact, Signals } from '../types';
import { hasAny } from './normalize';

export const NARROWER_PHRASES: readonly string[] = [
  'just one caller',
  'one specific caller',
  'a single call',
  'only one customer',
  'only this one account',
  'one-off',
  'happened once',
  'single occurrence',
];

export type ImpactEscalation = {
  effective_impact: Impact;
  impact_escalated_from: Impact | null;
  narrower_than_selected: boolean;
};

export function escalateImpact(
  selected: Impact | null | undefined,
  signals: Signals,
  lower: string,
): ImpactEscalation {
  // If impact is missing, default to many, not single.
  const base: Impact = selected ?? 'many';

  if (signals.outage_language && base !== 'outage') {
    return {
      effective_impact: 'outage',
      impact_escalated_from: base,
      narrower_than_selected: false,
    };
  }

  const readsNarrower =
    (base === 'many' || base === 'outage') && hasAny(lower, NARROWER_PHRASES);

  return {
    effective_impact: base,
    impact_escalated_from: null,
    narrower_than_selected: readsNarrower,
  };
}
