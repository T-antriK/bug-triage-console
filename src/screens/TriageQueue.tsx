import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BUCKET_IDS,
  BUCKET_LABELS,
  QUEUE_COPY,
  ROUTES,
  ROUTING_TEAMS,
  SEVERITY_LEVELS,
  STATUS_LABELS,
} from '../config';
import type {
  BucketId,
  ReportStatus,
  RoutingTeam,
  SeverityLevel,
  TriageReport,
} from '../types';
import { readReports } from '../store/reports';
import { formatDate, truncate } from '../lib/format';
import { StatusPill } from '../components/StatusPill';
import { SeverityBadge } from '../components/SeverityBadge';
import { ConfidenceBadge } from '../components/ConfidenceBadge';

type SortKey =
  | 'id'
  | 'created_at'
  | 'customer'
  | 'bucket_final'
  | 'severity_final'
  | 'confidence'
  | 'routing_final'
  | 'status';

// Discarded is not a filter option and discarded reports are not listed
// in the queue at all — they live only in the Data files tables.
const STATUS_OPTIONS: ReportStatus[] = ['draft', 'in_review', 'routed', 'resolved'];

type Filters = {
  bucket: Set<BucketId>;
  severity: Set<SeverityLevel>;
  status: Set<ReportStatus>;
  routing: Set<RoutingTeam>;
};

function readSet<T extends string>(raw: string | null, allowed: readonly T[]): Set<T> {
  if (!raw) return new Set();
  return new Set(raw.split(',').filter((v): v is T => (allowed as readonly string[]).includes(v)));
}

export default function TriageQueue() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [filters, setFilters] = useState<Filters>(() => ({
    bucket: readSet(params.get('bucket'), BUCKET_IDS),
    severity: readSet(params.get('sev'), SEVERITY_LEVELS),
    status: readSet(params.get('status'), STATUS_OPTIONS),
    routing: readSet(params.get('routing'), ROUTING_TEAMS),
  }));
  const [customer, setCustomer] = useState(params.get('customer') || '');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const reports = useMemo(
    // discarded reports never appear here
    () => readReports().filter((r) => r.status !== 'discarded'),
    [],
  );

  function syncParams(next: Record<string, string | null>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === '') p.delete(k);
      else p.set(k, v);
    }
    setParams(p, { replace: true });
  }

  function toggle<K extends keyof Filters>(row: K, value: Filters[K] extends Set<infer T> ? T : never) {
    setFilters((cur) => {
      const nextSet = new Set(cur[row] as Set<string>);
      if (nextSet.has(value as string)) nextSet.delete(value as string);
      else nextSet.add(value as string);
      const paramKey = row === 'severity' ? 'sev' : row;
      syncParams({ [paramKey]: Array.from(nextSet).join(',') });
      return { ...cur, [row]: nextSet } as Filters;
    });
  }

  const activeCount =
    filters.bucket.size +
    filters.severity.size +
    filters.status.size +
    filters.routing.size +
    (customer ? 1 : 0);

  function clearAll() {
    setFilters({
      bucket: new Set(),
      severity: new Set(),
      status: new Set(),
      routing: new Set(),
    });
    setCustomer('');
    syncParams({ bucket: null, sev: null, status: null, routing: null, customer: null });
  }

  const rows = useMemo(() => {
    const filtered = reports.filter((r) => {
      if (filters.bucket.size && !filters.bucket.has(r.bucket_final)) return false;
      if (filters.severity.size && !filters.severity.has(r.severity_final)) return false;
      if (filters.status.size && !filters.status.has(r.status)) return false;
      if (filters.routing.size && !filters.routing.has(r.routing_final)) return false;
      if (customer && !r.customer.toLowerCase().includes(customer.toLowerCase())) return false;
      return true;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = String(a[sortKey] ?? '');
      const bv = String(b[sortKey] ?? '');
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    });
  }, [reports, filters, customer, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const backQS = params.toString();

  function openReport(r: TriageReport) {
    navigate(`${ROUTES.REPORT}/${r.id}${backQS ? `?back=${encodeURIComponent(backQS)}` : ''}`);
  }

  const sortMark = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? QUEUE_COPY.SORT_ASC : QUEUE_COPY.SORT_DESC) : '';

  return (
    <div className="page page-wide">
      <h1>{QUEUE_COPY.TITLE}</h1>

      <div className="filter-groups">
        <FilterRow
          label={QUEUE_COPY.FILTER_BUCKET}
          options={BUCKET_IDS.map((b) => ({ value: b, label: BUCKET_LABELS[b] }))}
          active={filters.bucket}
          onToggle={(v) => toggle('bucket', v as BucketId)}
        />
        <FilterRow
          label={QUEUE_COPY.FILTER_SEVERITY}
          options={SEVERITY_LEVELS.map((s) => ({ value: s, label: s }))}
          active={filters.severity}
          onToggle={(v) => toggle('severity', v as SeverityLevel)}
        />
        <FilterRow
          label={QUEUE_COPY.FILTER_STATUS}
          options={STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          active={filters.status}
          onToggle={(v) => toggle('status', v as ReportStatus)}
        />
        <FilterRow
          label={QUEUE_COPY.FILTER_ROUTING}
          options={ROUTING_TEAMS.map((t) => ({ value: t, label: t }))}
          active={filters.routing}
          onToggle={(v) => toggle('routing', v as RoutingTeam)}
        />

        <div className="filter-row">
          <label className="filter-label" htmlFor="f-customer">
            {QUEUE_COPY.FILTER_CUSTOMER}
          </label>
          <input
            id="f-customer"
            type="text"
            value={customer}
            onChange={(e) => {
              setCustomer(e.target.value);
              syncParams({ customer: e.target.value });
            }}
          />
        </div>

        {activeCount > 0 && (
          <button type="button" className="btn-link filter-clear" onClick={clearAll}>
            {QUEUE_COPY.CLEAR_ALL}
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p>
          {QUEUE_COPY.EMPTY} <Link to={ROUTES.REPORT_NEW}>{QUEUE_COPY.EMPTY_LINK}</Link>
        </p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => toggleSort('id')}>
                  {QUEUE_COPY.COL_ID}
                  {sortMark('id')}
                </th>
                <th onClick={() => toggleSort('created_at')}>
                  {QUEUE_COPY.COL_CREATED}
                  {sortMark('created_at')}
                </th>
                <th onClick={() => toggleSort('customer')}>
                  {QUEUE_COPY.COL_CUSTOMER}
                  {sortMark('customer')}
                </th>
                <th>{QUEUE_COPY.COL_REPORT}</th>
                <th onClick={() => toggleSort('bucket_final')}>
                  {QUEUE_COPY.COL_BUCKET}
                  {sortMark('bucket_final')}
                </th>
                <th onClick={() => toggleSort('severity_final')}>
                  {QUEUE_COPY.COL_SEVERITY}
                  {sortMark('severity_final')}
                </th>
                <th onClick={() => toggleSort('confidence')}>
                  {QUEUE_COPY.COL_CONFIDENCE}
                  {sortMark('confidence')}
                </th>
                <th onClick={() => toggleSort('routing_final')}>
                  {QUEUE_COPY.COL_ROUTING}
                  {sortMark('routing_final')}
                </th>
                <th onClick={() => toggleSort('status')}>
                  {QUEUE_COPY.COL_STATUS}
                  {sortMark('status')}
                </th>
                <th>{QUEUE_COPY.COL_OVERRIDDEN}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => openReport(r)}>
                  <td className="mono-cell">{r.id}</td>
                  <td>{formatDate(r.created_at)}</td>
                  <td>{r.customer}</td>
                  <td className="wrap">
                    {truncate(r.bug_report, QUEUE_COPY.TRUNCATE_REPORT_CHARS)}
                  </td>
                  <td>{r.bucket_final}</td>
                  <td>
                    <SeverityBadge level={r.severity_final} />
                  </td>
                  <td>
                    <ConfidenceBadge level={r.confidence} />
                  </td>
                  <td>
                    {r.routing_final === 'Other'
                      ? r.routing_other_text ?? 'Other'
                      : r.routing_final}
                  </td>
                  <td>
                    <StatusPill status={r.status} />
                  </td>
                  <td>{r.was_overridden ? QUEUE_COPY.YES : QUEUE_COPY.NO}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- one filter row of toggle buttons ----
function FilterRow({
  label,
  options,
  active,
  onToggle,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  active: Set<string>;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="filter-row" role="group" aria-label={label}>
      <span className="filter-label">{label}</span>
      {options.map((o) => {
        const on = active.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            className={`filter-toggle${on ? ' filter-toggle-on' : ''}`}
            aria-pressed={on}
            onClick={() => onToggle(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
