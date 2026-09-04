// ============================================================
// traces.ts — decision traces, stored under their own localStorage key
// (they can be large). Capped at TRACE.STORE_CAP, oldest evicted first.
// The report carries only a `has_trace` boolean.
// ============================================================

import { STORAGE_KEYS, TRACE } from '../config';
import type { StoredTrace, Trace } from '../types';
import { readCollection, writeCollection } from './storage';

export function readTraces(): StoredTrace[] {
  return readCollection<StoredTrace>(STORAGE_KEYS.TRACES);
}

export function readTrace(reportId: string): Trace | null {
  return readTraces().find((t) => t.report_id === reportId)?.trace ?? null;
}

export function hasStoredTrace(reportId: string): boolean {
  return readTraces().some((t) => t.report_id === reportId);
}

/**
 * Pure: take a list of stored traces, sort oldest→newest by capture time,
 * and keep only the `cap` most recent (evict oldest first).
 */
export function evictOldest(rows: StoredTrace[], cap: number): StoredTrace[] {
  const sorted = [...rows].sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  return sorted.length > cap ? sorted.slice(sorted.length - cap) : sorted;
}

/**
 * Store (or replace) the trace for a report. Newest goes to the end;
 * anything beyond STORE_CAP is dropped from the front (oldest first).
 */
export function writeTrace(reportId: string, trace: Trace): void {
  const rows = readTraces().filter((t) => t.report_id !== reportId);
  rows.push({ report_id: reportId, captured_at: trace.captured_at, trace });
  writeCollection(STORAGE_KEYS.TRACES, evictOldest(rows, TRACE.STORE_CAP));
}

export function deleteTrace(reportId: string): void {
  writeCollection(
    STORAGE_KEYS.TRACES,
    readTraces().filter((t) => t.report_id !== reportId),
  );
}
