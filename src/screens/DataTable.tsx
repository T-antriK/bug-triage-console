import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ACTIVITY_TABLE_COLUMNS,
  DATA_FILES_COPY,
  DATA_TABLES,
  FEEDBACK_TABLE_COLUMNS,
  REPORT_TABLE_COLUMNS,
} from '../config';
import { readReports } from '../store/reports';
import { readActivity } from '../store/activity';
import { readFeedback } from '../store/feedback';
import { cellToString, downloadCSV, toCSV, toTSV } from '../lib/format';
import { toast } from '../lib/toast';

type TableName = keyof typeof DATA_TABLES;

function resolve(name: string): {
  label: string;
  columns: readonly string[];
  rows: Array<Record<string, unknown>>;
} | null {
  if (name === DATA_TABLES.reports.name) {
    return {
      label: DATA_TABLES.reports.label,
      columns: REPORT_TABLE_COLUMNS,
      rows: readReports() as unknown as Array<Record<string, unknown>>,
    };
  }
  if (name === DATA_TABLES.activity.name) {
    return {
      label: DATA_TABLES.activity.label,
      columns: ACTIVITY_TABLE_COLUMNS,
      rows: readActivity() as unknown as Array<Record<string, unknown>>,
    };
  }
  if (name === DATA_TABLES.feedback.name) {
    return {
      label: DATA_TABLES.feedback.label,
      columns: FEEDBACK_TABLE_COLUMNS,
      rows: readFeedback() as unknown as Array<Record<string, unknown>>,
    };
  }
  return null;
}

/** One generic HTML table for any of the three stores, with TSV copy and
 *  CSV download. Column order comes from config (input -> computed ->
 *  override -> lifecycle for reports). */
export default function DataTable() {
  const { name } = useParams();
  const [copied, setCopied] = useState(false);

  const data = useMemo(() => resolve(name ?? ''), [name]);

  if (!data) {
    return (
      <div className="page">
        <h1>{DATA_FILES_COPY.TITLE}</h1>
        <p>
          {DATA_FILES_COPY.UNKNOWN_TABLE}
          {name}
        </p>
      </div>
    );
  }

  const { label, columns, rows } = data;

  function copyTSV() {
    navigator.clipboard
      ?.writeText(toTSV(columns, rows))
      .then(() => {
        setCopied(true);
        toast(DATA_FILES_COPY.COPIED);
      })
      .catch(() => undefined);
  }

  function download() {
    downloadCSV(name ?? 'table', toCSV(columns, rows));
  }

  return (
    <div className="page page-wide">
      <div className="row">
        <h1>{label}</h1>
        <span className="spacer" />
        <button type="button" className="btn" onClick={copyTSV}>
          {copied ? DATA_FILES_COPY.COPIED : DATA_FILES_COPY.COPY_TSV}
        </button>
        <button type="button" className="btn" onClick={download}>
          {DATA_FILES_COPY.DOWNLOAD_CSV}
        </button>
      </div>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c} className="wrap">
                    {cellToString(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export type { TableName };
