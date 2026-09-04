// ============================================================
// feedback.ts — tiny append-only feedback store.
// ============================================================

import { ACTIVITY_ACTIONS, ACTORS, IDS, STORAGE_KEYS } from '../config';
import type { FeedbackEntry } from '../types';
import { readCollection, writeCollection } from './storage';
import { log } from './activity';

export function readFeedback(): FeedbackEntry[] {
  return readCollection<FeedbackEntry>(STORAGE_KEYS.FEEDBACK);
}

export function addFeedback(to: string, body: string): FeedbackEntry {
  const rows = readFeedback();
  const entry: FeedbackEntry = {
    id: IDS.FEEDBACK_PREFIX + String(rows.length + 1).padStart(IDS.FEEDBACK_PAD, '0'),
    timestamp: new Date().toISOString(),
    to,
    body,
  };
  rows.push(entry);
  writeCollection(STORAGE_KEYS.FEEDBACK, rows);

  log({
    actor: ACTORS.USER,
    action: ACTIVITY_ACTIONS.FEEDBACK_SUBMITTED,
    field: 'body',
    value_to: body,
    detail: `feedback id=${entry.id} to=${to} by=user`,
  });

  return entry;
}
