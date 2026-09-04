import type { Confidence } from '../types';

/** Confidence badge. Own colour scale (see tokens.css) so it never reads
 *  as the severity axis, and the word is always present so colour is not
 *  the only carrier. */
export function ConfidenceBadge({ level }: { level: Confidence }) {
  return (
    <span className="conf-badge" data-conf={level}>
      <span className="conf-dot" aria-hidden="true" />
      {level}
    </span>
  );
}
