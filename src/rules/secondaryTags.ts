/**
 * WHAT THIS DOES
 * Adds cross-cutting labels that describe a report without changing its
 * routing: data-loss, compliance, latency, regression, single-account,
 * financial. They render as small tags next to the primary bucket.
 *
 * HOW TO CHANGE IT
 * Each tag is one entry in TAG_RULES with a keyword list or a signal
 * check. Add a tag by adding an entry; remove one by deleting it.
 *
 * WHY IT WORKS THIS WAY
 * These cut across buckets ("financial" can attach to POST_CALL or LLM),
 * so they are kept out of bucket selection entirely. They are hints for
 * the reviewer and for later filtering, nothing more.
 */

import type { Impact, Signals } from '../types';
import { hasAny } from './normalize';
import { FINANCIAL_RECORDS_TERMS } from './severity';

export const SECONDARY_TAGS = [
  'data-loss',
  'compliance',
  'latency',
  'regression',
  'single-account',
  'financial',
] as const;

export type SecondaryTag = (typeof SECONDARY_TAGS)[number];

const LATENCY_TERMS = ['latency', 'seconds to', 'slow', 'delay', 'lag', 'taking 8', 'taking 10'];
const REGRESSION_TERMS = [
  'used to',
  'worked before',
  'since the deploy',
  'after the update',
  'regression',
  'started happening',
  'recently started',
  'this started',
];
const SINGLE_ACCOUNT_TERMS = ['one account', 'single account', 'only this customer', 'this account only'];

export function buildSecondaryTags(
  lower: string,
  signals: Signals,
  impact: Impact,
): SecondaryTag[] {
  const tags: SecondaryTag[] = [];

  if (signals.data_integrity === 'lost') tags.push('data-loss');
  if (signals.exposure === 'legal') tags.push('compliance');
  if (hasAny(lower, LATENCY_TERMS)) tags.push('latency');
  if (hasAny(lower, REGRESSION_TERMS)) tags.push('regression');
  if (impact === 'single' || hasAny(lower, SINGLE_ACCOUNT_TERMS)) tags.push('single-account');
  if (hasAny(lower, FINANCIAL_RECORDS_TERMS)) tags.push('financial');

  return tags;
}
