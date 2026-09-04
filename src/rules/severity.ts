/**
 * WHAT THIS DOES
 * Severity answers one question: what does it cost to wait?
 * Not how many people complained, and not how loud the failure is.
 *
 * Most triage rubrics collapse severity into blast radius, which
 * under-triages two things badly: single-caller reports carrying legal
 * exposure, and cosmetic-sounding bugs where the customer acts on the
 * wrong output.
 *
 * HOW TO CHANGE IT
 * Adjust BASE_GRID to change the default level for a blast radius /
 * loss-of-function combination. Add or edit FLOORS to change what
 * escalates regardless of caller count. Floors can only raise a level,
 * never lower one. SILENT_MODIFIER raises one level (capped) when a
 * failure left no trace.
 *
 * WHY IT WORKS THIS WAY
 * The explanation is a byproduct of execution — every step that changes
 * the level appends a sentence — so the reason chain can never contradict
 * the number it explains. There is no second model call to "explain".
 */

import type { Impact, SeverityLevel, Signals } from '../types';
import { SEVERITY_LEVELS } from '../config';
import { hasAny } from './normalize';

// Sev0 is the worst. Lower index = more severe.
// Exported so the verbose trace reuses the exact same ranking helpers
// rather than re-deriving them (no drift between severity() and its
// explanation).
export const RANK: Record<SeverityLevel, number> = {
  Sev0: 0,
  Sev1: 1,
  Sev2: 2,
  Sev3: 3,
};

/** The more severe (lower rank) of two levels. */
export function moreSevere(a: SeverityLevel, b: SeverityLevel): SeverityLevel {
  return RANK[a] <= RANK[b] ? a : b;
}

// ---- Step 2: base grid — blast radius x loss of function ----
export const BASE_GRID: Record<'many' | 'single', Record<Signals['functional_loss'], SeverityLevel>> =
  {
    many: { broken: 'Sev1', degraded: 'Sev2', cosmetic: 'Sev3' },
    single: { broken: 'Sev2', degraded: 'Sev3', cosmetic: 'Sev3' },
  };

// ---- Step 3: floors — evaluated in order, each takes the more severe of current and floor ----
// `condition` is the plain-English version of `when`, shown in the verbose
// floor table. Keep the two in sync when you edit a floor.
type FloorRule = {
  id: string;
  floor: SeverityLevel;
  reason: string;
  condition: string;
  when: (impact: Impact, s: Signals, lower: string) => boolean;
};

export const FLOORS: readonly FloorRule[] = [
  {
    id: 'data_loss_ongoing_at_scale',
    floor: 'Sev0',
    reason:
      'Data loss is active and affects many callers. The cleanup window grows every hour.',
    condition: "data_integrity is 'lost' AND data_loss_ongoing AND impact is 'many'",
    when: (impact, s) =>
      s.data_integrity === 'lost' && s.data_loss_ongoing && impact === 'many',
  },
  {
    id: 'compliance_systemic',
    floor: 'Sev0',
    reason: 'Compliance failure is reproducible on every call, not a one-off generation.',
    condition: "exposure is 'legal' AND exposure_prompt_level",
    when: (_impact, s) => s.exposure === 'legal' && s.exposure_prompt_level,
  },
  {
    id: 'data_lost',
    floor: 'Sev1',
    reason: 'Data is unrecoverable without a backfill. Shipping the fix does not end this.',
    condition: "data_integrity is 'lost'",
    when: (_impact, s) => s.data_integrity === 'lost',
  },
  {
    id: 'legal_exposure',
    floor: 'Sev1',
    reason: 'Legal or regulatory exposure. Caller count is close to irrelevant here.',
    condition: "exposure is 'legal'",
    when: (_impact, s) => s.exposure === 'legal',
  },
  {
    id: 'financial_records',
    floor: 'Sev1',
    reason: 'Financial records affected. Reconciliation cost compounds.',
    condition:
      "data_integrity is not 'clean' AND the text mentions a financial record (see FINANCIAL_RECORDS_TERMS)",
    // Some orgs set this to Sev0. One-word change if you want that.
    when: (_impact, s, lower) =>
      s.data_integrity !== 'clean' && hasAny(lower, FINANCIAL_RECORDS_TERMS),
  },
  {
    id: 'customer_harm',
    floor: 'Sev2',
    reason: 'The customer may act on materially wrong information.',
    condition: "exposure is 'customer_harm'",
    when: (_impact, s) => s.exposure === 'customer_harm',
  },
];

// The signal names each floor's condition reads. Used by the verbose
// floor table to show only the values that mattered.
export const FLOOR_SIGNAL_KEYS: Record<string, ReadonlyArray<keyof Signals>> = {
  data_loss_ongoing_at_scale: ['data_integrity', 'data_loss_ongoing'],
  compliance_systemic: ['exposure', 'exposure_prompt_level'],
  data_lost: ['data_integrity'],
  legal_exposure: ['exposure'],
  financial_records: ['data_integrity'],
  customer_harm: ['exposure'],
};

// "mentions financial records" for the financial_records floor.
export const FINANCIAL_RECORDS_TERMS: readonly string[] = [
  'payment',
  'payments',
  'transaction',
  'invoice',
  'billing',
  'refund',
  'reconcil',
  'ledger',
  'balance',
  'financial',
];

// ---- Step 4: silent-failure modifier ----
export const SILENT_MODIFIER = {
  raise: 1,
  capAt: 'Sev1' as SeverityLevel, // deliberately cannot manufacture a Sev0 on its own
  reason:
    'No error surfaced and the call looked normal. Damage accrues undetected until reconciliation.',
} as const;

export function raiseBy(level: SeverityLevel, steps: number, cap: SeverityLevel): SeverityLevel {
  const target = Math.max(RANK[cap], RANK[level] - steps);
  return SEVERITY_LEVELS[target];
}

/** The gate on the silent-failure modifier — exported so the trace shows
 *  the exact same test the modifier uses. */
export function silentModifierGate(s: Signals): boolean {
  return s.data_integrity !== 'clean' || s.functional_loss === 'broken';
}

export function severity(
  impact: Impact,
  s: Signals,
  lower = '',
): { level: SeverityLevel; reasons: string[] } {
  const reasons: string[] = [];

  // Step 1 — Outage short-circuit.
  if (impact === 'outage' || s.outage_language) {
    reasons.push(
      'Service-level failure indicated. The reporter has already made the severity call.',
    );
    return { level: 'Sev0', reasons };
  }

  // Step 2 — Base grid.
  const radius: 'many' | 'single' = impact === 'single' ? 'single' : 'many';
  let level = BASE_GRID[radius][s.functional_loss];
  reasons.push(
    `${radius === 'many' ? 'Many callers' : 'A single caller'} with ${s.functional_loss} functionality sets the base at ${level}.`,
  );

  // Step 3 — Floors, in order. Each can only raise.
  for (const rule of FLOORS) {
    if (!rule.when(impact, s, lower)) continue;
    const raised = moreSevere(level, rule.floor);
    if (RANK[raised] < RANK[level]) {
      level = raised;
      reasons.push(`Floor "${rule.id}" raises this to ${level}. ${rule.reason}`);
    }
  }

  // Step 4 — Silent-failure modifier.
  // Only applies when something is actually being lost or is materially
  // broken. A quiet cosmetic blemish (a trailing space in an export, a
  // truncated-but-present summary) is untidy, not silent damage, so the
  // modifier does not fire when the loss of function is only cosmetic and
  // the data is clean.
  const silentBites = silentModifierGate(s);
  if (s.silent_failure && silentBites) {
    const raised = raiseBy(level, SILENT_MODIFIER.raise, SILENT_MODIFIER.capAt);
    if (RANK[raised] < RANK[level]) {
      level = raised;
      reasons.push(`Silent-failure modifier raises this to ${level}. ${SILENT_MODIFIER.reason}`);
    }
  }

  // Step 5 — Return the level and the accumulated reasons.
  return { level, reasons };
}

// Severity is not priority. Severity measures how bad it is. Priority decides what gets
// worked next and takes account tier and sprint load into consideration. Keeping those out
// of here is what makes severity comparable across reporters and over time.
