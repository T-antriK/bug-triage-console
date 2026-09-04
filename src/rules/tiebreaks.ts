/**
 * WHAT THIS DOES
 * When more than one bucket scores above zero, these ordered rules try
 * to pick the winner by meaning rather than by raw score. Each rule is a
 * named boundary test written in plain English, with a small keyword
 * check that implements it. The first rule that clearly points at one of
 * the contending buckets wins; if none do, buckets.ts falls back to the
 * highest score and then BUCKET_PRECEDENCE.
 *
 * HOW TO CHANGE IT
 * Edit the keyword lists inside each rule, or reorder the TIEBREAKS
 * array. A rule may only choose between buckets that already scored; it
 * can never invent a bucket. To add a new boundary, copy one entry,
 * give it a name and plainEnglish sentence, and implement `decide`.
 *
 * WHY IT WORKS THIS WAY
 * Two neighbouring buckets often share vocabulary ("slow", "wrong",
 * "call"). Score alone then coin-flips. These tests encode the actual
 * distinction a senior triager would make out loud, so the tie is broken
 * the same way every time and the reason is legible.
 */

import type { BucketId } from '../types';
import { hasAny } from './normalize';

export type Tiebreak = {
  name: string;
  plainEnglish: string;
  /** Return a bucket only if it is in `contenders` and the rule clearly applies. */
  decide: (lower: string, contenders: readonly BucketId[]) => BucketId | null;
};

const pick = (
  bucket: BucketId,
  contenders: readonly BucketId[],
  when: boolean,
): BucketId | null => (when && contenders.includes(bucket) ? bucket : null);

export const TIEBREAKS: readonly Tiebreak[] = [
  {
    name: 'whether_vs_what',
    plainEnglish:
      'If the question is whether something got written at all, it is Infra. ' +
      'If it is about what got written, it is Post-call.',
    decide: (lower, contenders) => {
      // "nobody flagged an error" / "no errors" is the ABSENCE of a
      // transport failure — the negation has to beat the raw keyword.
      const errorDenied = hasAny(lower, [
        'no error',
        'no errors',
        'nobody flagged',
        'without an error',
        'not an error',
        'no alerts',
        'fired successfully',
        '200 ok',
      ]);
      const transportFailing =
        !errorDenied &&
        hasAny(lower, [
          '500',
          '502',
          '503',
          '5xx',
          ' error',
          'errors',
          'endpoint',
          'timeout',
          'timed out',
          'exception',
        ]);
      if (transportFailing) return pick('INFRA', contenders, true);
      const contentWrongButDelivered = hasAny(lower, [
        '200 ok',
        'fired successfully',
        'call completed',
        'call connects',
        'calls connect',
        'calls finish',
        'after the call',
        'after calls',
        'synced',
        'summary',
        'summaries',
        'notes',
        'disposition',
        'from a different call',
      ]);
      return pick('POST_CALL', contenders, contentWrongButDelivered);
    },
  },
  {
    name: 'direction',
    plainEnglish:
      'Audio wrong on the way in is STT. Audio wrong on the way out is TTS. ' +
      'A bad transcript is STT even when the audio sounded fine.',
    decide: (lower, contenders) => {
      // A transcript that is explicitly fine is not an STT problem, even
      // though the word "transcript" appears.
      const transcriptFine = hasAny(lower, [
        'transcript looks perfect',
        'transcript is perfect',
        'transcript looks fine',
        'transcript is fine',
        'heard right',
        'heard correctly',
        'words were heard',
      ]);
      const inbound =
        !transcriptFine &&
        hasAny(lower, [
          'transcript',
          'misheard',
          'misrecogni',
          'inaudible',
          'heard it as',
          'hearing',
          'wrong language',
          'accent',
        ]);
      if (inbound) return pick('STT', contenders, true);
      const outbound = hasAny(lower, [
        'voice sounds',
        'robotic',
        'garbled',
        'pronunciation',
        'reads the amount',
        'speech output',
        'cuts off',
        'barge',
        'make out what',
        'could not make out',
        "couldn't make out",
      ]);
      return pick('TTS', contenders, outbound);
    },
  },
  {
    name: 'tool_misuse_is_reasoning',
    plainEnglish:
      'A bad account lookup against a working API is an LLM problem, not Infra. ' +
      'The API answered; the agent used it wrong.',
    decide: (lower, contenders) => {
      const apiAnswered = hasAny(lower, [
        'valid',
        'returns a',
        'api returns',
        'record but',
        '200 ok',
        'lookup',
        'tool use',
        'wrong customer',
        'previous caller',
        // the service is fine, the agent's reading of it is not
        'dashboard shows',
        'shows it healthy',
        'shows healthy',
        'is healthy',
        'looks healthy',
        'account shows it open',
      ]);
      const noTransportError = !hasAny(lower, ['500', '502', '503', '5xx', 'timeout', 'endpoint down']);
      return pick('LLM', contenders, apiAnswered && noTransportError);
    },
  },
  {
    name: 'latency_source',
    plainEnglish:
      'Latency that grows with call length points at context growth, so LLM. ' +
      'Latency that is constant from the first turn points at TTS or Infra.',
    decide: (lower, contenders) => {
      const growsWithCall = hasAny(lower, [
        'on long calls',
        'long calls',
        'later in the call',
        'grows',
        'gets slower',
        'further into the call',
      ]);
      if (growsWithCall) return pick('LLM', contenders, true);
      const constantFromStart = hasAny(lower, [
        'from the first turn',
        'first turn',
        'even the greeting',
        'greeting itself',
        'constant',
        'from the start',
      ]);
      if (constantFromStart) {
        return (
          pick('TTS', contenders, hasAny(lower, ['greeting', 'voice', 'speak', 'audio'])) ??
          pick('INFRA', contenders, true)
        );
      }
      return null;
    },
  },
];

/**
 * Run the ladder. `contenders` is the set of buckets that scored > 0.
 * Returns the first confident pick, or null if the ladder is silent.
 */
export function applyTiebreaks(
  lower: string,
  contenders: readonly BucketId[],
): { bucket: BucketId; via: string } | null {
  if (contenders.length < 2) return null;
  for (const rule of TIEBREAKS) {
    const choice = rule.decide(lower, contenders);
    if (choice) return { bucket: choice, via: rule.name };
  }
  return null;
}
