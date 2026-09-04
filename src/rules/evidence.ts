/**
 * WHAT THIS DOES
 * Turns the keywords that fired during classification into evidence
 * spans: { field, text, start, end, supports }. Every span is verified
 * to be an exact substring of the submitted report before it is kept —
 * anything that fails the check is dropped, not rendered.
 *
 * HOW TO CHANGE IT
 * The spans come straight from the keyword tables in buckets.ts and
 * signals.ts, so you tune evidence by tuning those. MAX_SPANS caps how
 * many are shown. `supports` values are the union type EvidenceSupport
 * in types.ts.
 *
 * WHY IT WORKS THIS WAY
 * Ten lines of indexOf are what make "auditable" real instead of
 * claimed. If the highlight is not literally in the text the reviewer
 * submitted, it does not belong on screen.
 */

import type { EvidenceSpan, EvidenceSupport, Signals } from '../types';
import { SIGNAL_PATTERNS, signalMatches } from './signals';

export const MAX_SPANS = 12;

type Candidate = { keyword: string; supports: EvidenceSupport };

function locate(original: string, keyword: string): { start: number; end: number } | null {
  const idx = original.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx < 0) return null;
  return { start: idx, end: idx + keyword.length };
}

/** Collect the keyword/support pairs worth trying to highlight. */
function collectCandidates(
  bucketKeywords: readonly string[],
  lower: string,
  signals: Signals,
): Candidate[] {
  const out: Candidate[] = [];

  for (const keyword of bucketKeywords) out.push({ keyword, supports: 'bucket' });

  const push = (keys: string[], supports: EvidenceSupport) => {
    for (const keyword of keys) out.push({ keyword, supports });
  };

  if (signals.functional_loss === 'broken') {
    push(signalMatches(lower, 'functional_broken'), 'severity.functional_loss');
  } else if (signals.functional_loss === 'cosmetic') {
    push(signalMatches(lower, 'functional_cosmetic'), 'severity.functional_loss');
  }
  if (signals.data_integrity === 'lost') {
    push(signalMatches(lower, 'data_integrity_lost'), 'severity.data_integrity');
  }
  if (signals.data_loss_ongoing) {
    push(signalMatches(lower, 'data_loss_ongoing'), 'severity.data_loss_ongoing');
  }
  if (signals.exposure === 'legal') {
    push(signalMatches(lower, 'exposure_legal'), 'severity.exposure');
  } else if (signals.exposure === 'customer_harm') {
    push(signalMatches(lower, 'exposure_customer_harm'), 'severity.exposure');
  }
  if (signals.exposure_prompt_level) {
    push(signalMatches(lower, 'exposure_prompt_level'), 'severity.exposure_prompt_level');
  }
  if (signals.silent_failure) {
    push(signalMatches(lower, 'silent_failure_present'), 'severity.silent_failure');
  }
  if (signals.outage_language) {
    const keys = signalMatches(lower, 'outage_language');
    push(keys, 'severity.outage_language');
    push(keys, 'impact');
  }

  return out;
}

/** Build verified, de-overlapped spans against the ORIGINAL submitted text. */
export function buildEvidence(
  original: string,
  bucketKeywords: readonly string[],
  lower: string,
  signals: Signals,
): EvidenceSpan[] {
  const candidates = collectCandidates(bucketKeywords, lower, signals);
  const spans: EvidenceSpan[] = [];
  const seen = new Set<string>();

  for (const c of candidates) {
    const at = locate(original, c.keyword);
    if (!at) continue; // substring guard: not verbatim -> dropped

    const key = `${at.start}:${at.end}:${c.supports}`;
    if (seen.has(key)) continue;
    seen.add(key);

    spans.push({
      field: 'bug_report',
      text: original.slice(at.start, at.end),
      start: at.start,
      end: at.end,
      supports: c.supports,
      provenance: 'rules',
    });
  }

  // Longest-first at each start, then keep only non-overlapping spans so a
  // keyword nested inside another ("error" within "errors") never renders as
  // a stray fragment.
  spans.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const nonOverlapping: EvidenceSpan[] = [];
  let lastEnd = -1;
  for (const s of spans) {
    if (s.start < lastEnd) continue;
    nonOverlapping.push(s);
    lastEnd = s.end;
  }
  return nonOverlapping.slice(0, MAX_SPANS);
}

// Referenced so unused-import checks stay honest if collectCandidates is trimmed.
export const EVIDENCE_SIGNAL_KEYS = Object.keys(SIGNAL_PATTERNS);
