// ============================================================
// activity.ts — the append-only log. Never updated, never deleted.
// When FEATURES.ACTIVITY_LOG_ENABLED is false, log() is a no-op and
// the nav item is hidden, but the rest of the app is unaffected.
// ============================================================

import {
  ACTIVITY_TRUNCATED_MARK,
  ACTIVITY_VALUE_MAX_CHARS,
  FEATURES,
  IDS,
  MESSAGES,
  STORAGE_KEYS,
} from '../config';
import type { ActivityEntry, Actor } from '../types';
import { readCollection, writeCollection } from './storage';

export function readActivity(): ActivityEntry[] {
  return readCollection<ActivityEntry>(STORAGE_KEYS.ACTIVITY);
}

// value_from / value_to carry real content, never lengths or summaries.
// They are only capped so one giant paste can't bloat the log unbounded.
function capValue(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (value.length <= ACTIVITY_VALUE_MAX_CHARS) return value;
  return value.slice(0, ACTIVITY_VALUE_MAX_CHARS) + ACTIVITY_TRUNCATED_MARK;
}

function nextId(count: number): string {
  return IDS.ACTIVITY_PREFIX + String(count + 1).padStart(IDS.ACTIVITY_PAD, '0');
}

export type LogInput = {
  report_id?: string | null;
  actor: Actor;
  action: string;
  field?: string | null;
  value_from?: string | null;
  value_to?: string | null;
  detail: string;
  llm_rationale?: string | null;
};

export function log(input: LogInput): void {
  if (!FEATURES.ACTIVITY_LOG_ENABLED) return;

  const rows = readActivity();
  const rationale =
    input.llm_rationale != null
      ? input.llm_rationale.slice(0, MESSAGES.LLM_RATIONALE_MAX)
      : null;

  const entry: ActivityEntry = {
    id: nextId(rows.length),
    timestamp: new Date().toISOString(),
    report_id: input.report_id ?? null,
    actor: input.actor,
    action: input.action,
    field: input.field ?? null,
    value_from: capValue(input.value_from),
    value_to: capValue(input.value_to),
    detail: input.detail,
    llm_rationale: rationale,
  };

  rows.push(entry);
  writeCollection(STORAGE_KEYS.ACTIVITY, rows);
}
