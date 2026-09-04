import { STATUS_LABELS } from '../config';
import type { ReportStatus } from '../types';

export function StatusPill({ status }: { status: ReportStatus }) {
  return (
    <span className="status-pill" data-status={status}>
      {STATUS_LABELS[status]}
    </span>
  );
}
