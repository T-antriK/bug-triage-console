/**
 * WHAT THIS DOES
 * Optional, behind FEATURES.DUPLICATE_DETECTION (default off). Compares a
 * new report's text against currently-open reports using token-overlap
 * similarity. Above CLASSIFIER.DUPLICATE_SIMILARITY_THRESHOLD it returns
 * a match so the form can show a non-blocking banner.
 *
 * HOW TO CHANGE IT
 * The threshold lives in config.ts. The similarity function is plain
 * Jaccard over lowercased word tokens — swap it here if you want
 * something smarter, but keep it synchronous and dependency-free.
 *
 * WHY IT WORKS THIS WAY
 * Off by default because a false "this is a duplicate" is more annoying
 * than a missed one, and the queue is small in a prototype. It is here
 * so turning it on is a one-flag change, not a rewrite.
 */

import type { TriageReport } from '../types';
import { CLASSIFIER } from '../config';

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

export function similarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export type DuplicateMatch = { id: string; score: number };

const OPEN_STATUSES = new Set(['draft', 'in_review']);

export function findDuplicate(
  text: string,
  reports: readonly TriageReport[],
  excludeId?: string,
): DuplicateMatch | null {
  let best: DuplicateMatch | null = null;
  for (const r of reports) {
    if (r.id === excludeId) continue;
    if (!OPEN_STATUSES.has(r.status)) continue;
    const score = similarity(text, r.bug_report);
    if (score >= CLASSIFIER.DUPLICATE_SIMILARITY_THRESHOLD && (!best || score > best.score)) {
      best = { id: r.id, score };
    }
  }
  return best;
}
