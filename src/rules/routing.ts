/**
 * WHAT THIS DOES
 * Maps a bucket to the team that owns it and a one-line "what to check
 * first". Separately, builds the list of escalation actions that fire
 * from the severity / exposure / confidence of this specific report.
 *
 * HOW TO CHANGE IT
 * To move a bucket to a different team, change its `team` in ROUTING.
 * This is the one-line change referenced in buckets.ts for splitting
 * STT/TTS from LLM. To add or retune an escalation, edit ESCALATIONS —
 * each entry is a condition plus the action text shown to the reviewer.
 *
 * WHY IT WORKS THIS WAY
 * Routing is deliberately dumb: bucket in, team out. All the judgement
 * lives upstream in bucket selection. Escalations are kept as a separate
 * list because they cut across buckets — a Sev0 pages on-call whether it
 * is INFRA or LLM.
 */

import type { BucketId, Confidence, RoutingTeam, SeverityLevel, Signals } from '../types';

export const ROUTING: Record<BucketId, { team: RoutingTeam; check: string }> = {
  STT: { team: 'Voice AI', check: 'ASR model version, audio codec, language config' },
  TTS: { team: 'Voice AI', check: 'TTS voice config, SSML rules, number formatting' },
  LLM: { team: 'Voice AI', check: 'System prompt version, tool definitions, context window' },
  POST_CALL: {
    team: 'Integrations',
    check: 'Webhook delivery log, CRM API responses, idempotency keys',
  },
  INFRA: {
    team: 'Platform/Infra',
    check: 'Error rates, carrier status, storage health, auth logs',
  },
};

type EscalationRule = {
  id: string;
  action: string;
  when: (ctx: {
    severity: SeverityLevel;
    confidence: Confidence;
    signals: Signals;
  }) => boolean;
};

export const ESCALATIONS: readonly EscalationRule[] = [
  {
    id: 'sev0',
    action: 'Page on-call. Notify incident channel.',
    when: ({ severity }) => severity === 'Sev0',
  },
  {
    id: 'legal',
    action: 'Notify Legal and Compliance in parallel.',
    when: ({ signals }) => signals.exposure === 'legal',
  },
  {
    id: 'data_lost',
    action: 'Flag for backfill scoping.',
    when: ({ signals }) => signals.data_integrity === 'lost',
  },
  {
    id: 'low_confidence',
    action: 'Hold in review. Do not auto-route.',
    when: ({ confidence }) => confidence === 'Low',
  },
];

export function routeBucket(bucket: BucketId): { team: RoutingTeam; check: string } {
  return ROUTING[bucket];
}

export function escalationsFor(ctx: {
  severity: SeverityLevel;
  confidence: Confidence;
  signals: Signals;
}): string[] {
  return ESCALATIONS.filter((rule) => rule.when(ctx)).map((rule) => rule.action);
}
