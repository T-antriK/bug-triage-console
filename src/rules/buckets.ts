/**
 * WHAT THIS DOES
 * A bucket answers "which layer of the stack got it wrong." This file
 * holds the five bucket definitions, each with a plain-English boundary
 * rule that separates it from its nearest neighbour, a list of keyword
 * patterns that score points toward the bucket, and a list of negative
 * keywords that score points away from it. scoreBuckets() turns a report
 * into a score per bucket.
 *
 * HOW TO CHANGE IT
 * To make a phrase count toward a bucket, add it to that bucket's
 * `patterns` array (lowercase, straight quotes). To stop a phrase from
 * dragging a report into the wrong bucket, add it to the neighbour's
 * `negative` array. Scoring is +2 per distinct pattern hit and -3 per
 * distinct negative hit, floored at 0. Change SCORE_PATTERN_HIT /
 * SCORE_NEGATIVE_HIT below if you want a different balance.
 *
 * WHY IT WORKS THIS WAY
 * Keyword arrays beat regexes here because a non-programmer has to be
 * able to read and edit them. The boundary rules are the real spec; the
 * keywords are just the current best approximation of them. When two
 * buckets both score, tiebreaks.ts and BUCKET_PRECEDENCE decide — the
 * raw score is only a first cut.
 *
 * Note for the editor: all three voice buckets (STT, TTS, LLM) currently
 * route to "Voice AI" because that is the vocabulary the case study uses.
 * In a larger org, STT/TTS (platform) and LLM (agent behaviour) are
 * different teams. Splitting them is a one-line change in routing.ts.
 */

import type { BucketId } from '../types';
import { matched } from './normalize';

export const SCORE_PATTERN_HIT = 2;
export const SCORE_NEGATIVE_HIT = -3;

export type BucketDef = {
  owner: string;
  boundary: string;
  patterns: readonly string[];
  negative: readonly string[];
};

export const BUCKETS: Record<BucketId, BucketDef> = {
  STT: {
    owner: 'Voice AI',
    boundary: 'Audio wrong on the way IN. The caller said it, the system heard it wrong.',
    patterns: [
      'misheard',
      'mishears',
      'hearing',
      'hears',
      'heard',
      'transcript',
      'inaudible',
      'recognition',
      'misrecogni',
      'accent',
      'diarization',
      'partial transcript',
      'wrong language',
      'responded in english',
      'responding in english',
      'speaks english',
      'spanish',
      'misunderstand',
      'speech to text',
      "didn't catch",
      'did not catch',
      // Iteration 2 — plainer phrasings for the recognition failure
      'gibberish',
      'thick accent',
    ],
    negative: ['voice sounds', 'pronunciation', 'reads the amount', 'robotic'],
  },

  TTS: {
    owner: 'Voice AI',
    boundary: 'Audio wrong on the way OUT. The system said it, the caller heard it wrong.',
    patterns: [
      'voice sounds',
      'robotic',
      'garbled',
      'pronunciation',
      'mispronounce',
      'reads the amount',
      'reads it as',
      'barge-in',
      'barge in',
      'cuts off mid-sentence',
      'cuts off mid sentence',
      'interrupt',
      'audio quality',
      'speech output',
      'says it as',
      'muffled',
      'greeting itself',
      'audio greeting',
      // Iteration 2 — output-side problems described without TTS vocabulary
      'voice response',
      'asking it to repeat',
      'ask it to repeat',
      'make out what',
      'reads the due date',
      'reads the date',
      'greeting sounds',
      'brand voice',
    ],
    negative: ['transcript', 'misheard', 'takes seconds to respond'],
  },

  LLM: {
    owner: 'Voice AI',
    boundary: 'The words were heard and spoken correctly. The REASONING was wrong.',
    patterns: [
      'repeats',
      'repeat the',
      'loop',
      'looping',
      'hallucinat',
      'wrong intent',
      'ignores what',
      'follows its own',
      'previous caller',
      'wrong customer',
      'reads out the',
      'record but',
      'refused',
      'refusal',
      'insists',
      "won't check",
      'wont check',
      'will not check',
      'policy',
      'disclaimer',
      'threatened',
      'arrested',
      'bad reasoning',
      'tool use',
      'account lookup',
      'context window',
      'long calls',
      'on long calls',
      'asks again',
      'asks the same',
      // Iteration 2 — reasoning failures in plain speech
      'in circles',
      'confused about',
      "wouldn't look",
      'wont look',
      'would not look',
      'look it up',
      'tells callers',
      'tells customers',
      'telling every caller',
      'was told',
      'told their',
      'agent implied',
      'implied they',
    ],
    negative: ['not saving', 'nothing is saving', '500', 'file not found', 'webhook'],
  },

  POST_CALL: {
    owner: 'Integrations',
    boundary: 'The call completed. WHAT got written afterwards is wrong or missing.',
    patterns: [
      'salesforce',
      'crm',
      'summary',
      'call notes',
      'call summary',
      'disposition',
      'qa label',
      'after the call',
      'synced contact',
      'logged',
      'double-log',
      'double-logs',
      'duplicate',
      'transaction id',
      'no summary',
      'notes are missing',
      'never gets',
      'not populated',
      // Iteration 2 — "what got written" phrased loosely
      'summaries',
      'after calls finish',
      'after calls',
      'no notes',
      'disposition code',
      'wrong disposition',
    ],
    negative: ['500', 'webhook down', 'endpoint', ' error'],
  },

  INFRA: {
    owner: 'Platform/Infra',
    boundary: 'WHETHER anything happened at all. Transport, storage, auth, delivery.',
    patterns: [
      '500',
      'error',
      'errors',
      '5xx',
      'endpoint',
      'webhook',
      'dialed',
      'never receives',
      'connect rate',
      'dropped',
      'file not found',
      'storage',
      'auth',
      'rate limit',
      'service outage',
      'nothing is saving',
      "can't retrieve",
      'cant retrieve',
      'cannot retrieve',
      'timeout',
      'timed out',
      // Iteration 2 — more transport / delivery failure vocabulary
      '502',
      '503',
      'not connecting',
      'connecting at all',
      'not landing',
      'landing anywhere',
      'returns nothing',
      'return nothing',
    ],
    negative: [],
  },
};

// First match wins when the tiebreaks do not resolve it.
// Infra sits first because when transport is down, every layer above it looks broken.
export const BUCKET_PRECEDENCE: readonly BucketId[] = [
  'INFRA',
  'POST_CALL',
  'LLM',
  'STT',
  'TTS',
];

export const ALL_BUCKETS: readonly BucketId[] = ['STT', 'TTS', 'LLM', 'POST_CALL', 'INFRA'];

export type BucketScoring = {
  scores: Record<BucketId, number>;
  matchedPatterns: Record<BucketId, string[]>;
  topScore: number;
};

/** +2 per distinct pattern hit, -3 per distinct negative hit, floor at 0. */
export function scoreBuckets(lower: string): BucketScoring {
  const scores = {} as Record<BucketId, number>;
  const matchedPatterns = {} as Record<BucketId, string[]>;

  for (const bucket of ALL_BUCKETS) {
    const def = BUCKETS[bucket];
    const hits = matched(lower, def.patterns);
    const negs = matched(lower, def.negative);
    const raw = hits.length * SCORE_PATTERN_HIT + negs.length * SCORE_NEGATIVE_HIT;
    scores[bucket] = Math.max(0, raw);
    matchedPatterns[bucket] = hits;
  }

  const topScore = Math.max(...ALL_BUCKETS.map((b) => scores[b]));
  return { scores, matchedPatterns, topScore };
}
