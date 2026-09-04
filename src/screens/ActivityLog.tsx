import { useMemo, useState } from 'react';
import { ACTIVITY_COPY, ACTORS, COMMON } from '../config';
import type { Actor } from '../types';
import { readActivity } from '../store/activity';
import { formatDate } from '../lib/format';

/** Reverse-chronological, filterable by report id and actor. This screen
 *  is not mounted at all when FEATURES.ACTIVITY_LOG_ENABLED is false. */
export default function ActivityLog() {
  const [reportId, setReportId] = useState('');
  const [actor, setActor] = useState<Actor | ''>('');

  const entries = useMemo(() => readActivity(), []);

  const rows = useMemo(() => {
    const filtered = entries.filter((e) => {
      if (reportId && (e.report_id ?? '').toLowerCase().indexOf(reportId.toLowerCase()) < 0)
        return false;
      if (actor && e.actor !== actor) return false;
      return true;
    });
    return [...filtered].reverse();
  }, [entries, reportId, actor]);

  return (
    <div className="page page-wide">
      <h1>{ACTIVITY_COPY.TITLE}</h1>

      <div className="filters">
        <div className="field">
          <label htmlFor="a-report">{ACTIVITY_COPY.FILTER_REPORT}</label>
          <input
            id="a-report"
            type="text"
            className="mono"
            value={reportId}
            onChange={(e) => setReportId(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="a-actor">{ACTIVITY_COPY.FILTER_ACTOR}</label>
          <select
            id="a-actor"
            value={actor}
            onChange={(e) => setActor(e.target.value as Actor | '')}
          >
            <option value="">{ACTIVITY_COPY.FILTER_ALL}</option>
            {Object.values(ACTORS).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <p>{ACTIVITY_COPY.EMPTY}</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{ACTIVITY_COPY.COL_TIMESTAMP}</th>
                <th>{ACTIVITY_COPY.COL_REPORT}</th>
                <th>{ACTIVITY_COPY.COL_ACTOR}</th>
                <th>{ACTIVITY_COPY.COL_ACTION}</th>
                <th>{ACTIVITY_COPY.COL_FIELD}</th>
                <th>{ACTIVITY_COPY.COL_FROM}</th>
                <th>{ACTIVITY_COPY.COL_TO}</th>
                <th>{ACTIVITY_COPY.COL_DETAIL}</th>
                <th>{ACTIVITY_COPY.COL_RATIONALE}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.timestamp)}</td>
                  <td className="mono-cell">{e.report_id ?? COMMON.NONE_DASH}</td>
                  <td>{e.actor}</td>
                  <td className="mono-cell">{e.action}</td>
                  <td>{e.field ?? COMMON.NONE_DASH}</td>
                  <td className="wrap">{e.value_from ?? COMMON.NONE_DASH}</td>
                  <td className="wrap">{e.value_to ?? COMMON.NONE_DASH}</td>
                  <td className="wrap mono-cell">{e.detail}</td>
                  <td className="wrap">{e.llm_rationale ?? COMMON.NONE_DASH}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
