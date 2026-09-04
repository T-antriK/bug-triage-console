import { TRACE_COPY } from '../config';
import type { PipelineResult, Trace, TriageReport } from '../types';

/**
 * Re-run vs. stored: a per-step diff of two traces plus the
 * classification before/after. Purely a view — Apply happens in the
 * parent, nothing here writes.
 */
export function TraceDiff({
  before,
  after,
  storedReport,
  rerunResult,
}: {
  before: Trace;
  after: Trace;
  storedReport: TriageReport;
  rerunResult: PipelineResult;
}) {
  const rows = after.steps.map((step) => {
    const prior = before.steps.find((s) => s.id === step.id);
    return {
      id: step.id,
      title: TRACE_COPY.STEP_TITLE[step.id],
      before: prior?.summary ?? '(new step)',
      after: step.summary,
      changed: (prior?.summary ?? '') !== step.summary,
    };
  });
  const changed = rows.filter((r) => r.changed);
  const unchanged = rows.filter((r) => !r.changed);

  const classChanged =
    storedReport.bucket !== rerunResult.bucket ||
    storedReport.severity !== rerunResult.severity ||
    storedReport.confidence !== rerunResult.confidence ||
    storedReport.routing_suggestion !== rerunResult.routing_suggestion;

  return (
    <div className="trace-diff">
      <h3>{TRACE_COPY.RERUN_TITLE}</h3>

      <table className="data-table trace-table">
        <thead>
          <tr>
            <th>{TRACE_COPY.DIFF_CLASSIFICATION}</th>
            <th>{TRACE_COPY.DIFF_BEFORE}</th>
            <th>{TRACE_COPY.DIFF_AFTER}</th>
          </tr>
        </thead>
        <tbody>
          <ClassRow label="bucket" a={storedReport.bucket} b={rerunResult.bucket} />
          <ClassRow label="severity" a={storedReport.severity} b={rerunResult.severity} />
          <ClassRow label="confidence" a={storedReport.confidence} b={rerunResult.confidence} />
          <ClassRow
            label="routing"
            a={storedReport.routing_suggestion}
            b={rerunResult.routing_suggestion}
          />
        </tbody>
      </table>

      {!classChanged && changed.length === 0 ? (
        <p className="muted small" style={{ marginTop: 'var(--s-3)' }}>
          {TRACE_COPY.DIFF_NONE_CHANGED}
        </p>
      ) : (
        <>
          <p className="small" style={{ marginTop: 'var(--s-3)' }}>
            <strong>{TRACE_COPY.DIFF_CHANGED}</strong> ({changed.length})
          </p>
          {changed.length === 0 ? (
            <p className="muted small">— step summaries unchanged —</p>
          ) : (
            <table className="data-table trace-table">
              <thead>
                <tr>
                  <th>step</th>
                  <th>{TRACE_COPY.DIFF_BEFORE}</th>
                  <th>{TRACE_COPY.DIFF_AFTER}</th>
                </tr>
              </thead>
              <tbody>
                {changed.map((r) => (
                  <tr key={r.id} className="trace-fired">
                    <td>{r.title}</td>
                    <td className="wrap">{r.before}</td>
                    <td className="wrap">{r.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="small muted" style={{ marginTop: 'var(--s-2)' }}>
            {TRACE_COPY.DIFF_UNCHANGED}: {unchanged.map((r) => r.title).join(', ') || 'none'}
          </p>
        </>
      )}
    </div>
  );
}

function ClassRow({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <tr className={a !== b ? 'trace-fired' : ''}>
      <td>{label}</td>
      <td>{a}</td>
      <td>
        <strong>{b}</strong>
      </td>
    </tr>
  );
}
