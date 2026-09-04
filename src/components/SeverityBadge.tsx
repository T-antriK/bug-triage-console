import { SEVERITY_LABELS } from '../config';
import type { SeverityLevel } from '../types';

/** Severity shown with its own colour scale AND the label text, so colour
 *  is never the sole carrier of meaning. */
export function SeverityBadge({ level }: { level: SeverityLevel }) {
  return (
    <span className="sev-badge" data-sev={level} title={SEVERITY_LABELS[level]}>
      <span className="sev-dot" aria-hidden="true" />
      {SEVERITY_LABELS[level]}
    </span>
  );
}
