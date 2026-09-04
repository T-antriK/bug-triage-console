import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ACTIVITY_ACTIONS,
  ACTORS,
  FEATURES,
  IMPACT_LABELS,
  IMPACT_OPTIONS,
  MESSAGES,
  ROUTES,
  VALIDATION,
} from '../config';
import type { Impact, TriageInput, TriageReport } from '../types';
import { parseCsv } from '../lib/csvParser';
import { runTriage } from '../lib/triage';
import { findDuplicate } from '../rules/duplicates';
import { createDraft, readReports, submitReport } from '../store/reports';
import { log } from '../store/activity';
import { readSettings } from '../store/storage';

// ---- template columns ----
const TEMPLATE_COLUMNS = ['bug_report', 'customer', 'call_id', 'started_at', 'impact'] as const;
type Col = (typeof TEMPLATE_COLUMNS)[number];

const COLUMN_SPEC: { col: Col; required: boolean; note: string }[] = [
  { col: 'bug_report', required: true, note: `Free text. Min ${VALIDATION.BUG_REPORT_MIN_CHARS} chars, max ${VALIDATION.BUG_REPORT_MAX_CHARS}.` },
  { col: 'customer', required: true, note: 'Customer or account name.' },
  { col: 'call_id', required: false, note: 'Optional call identifier.' },
  { col: 'started_at', required: false, note: 'YYYY-MM-DD or blank.' },
  {
    col: 'impact',
    required: true,
    note: `One of: ${IMPACT_OPTIONS.join(', ')} — or the display labels Single caller, Many callers, Outage.`,
  },
];

type RowStatus = 'valid' | 'error' | 'warning';

type ParsedRow = {
  index: number; // 1-based row number in the file
  raw: Record<Col, string>;
  input: TriageInput | null; // non-null iff status !== 'error'
  status: RowStatus;
  reasons: string[]; // error/warning messages
};

// ---- impact normalisation ----
function parseImpact(raw: string): Impact | null {
  const s = raw.trim().toLowerCase();
  if (s === 'single' || s === 'single caller') return 'single';
  if (s === 'many' || s === 'many callers') return 'many';
  if (s === 'outage') return 'outage';
  return null;
}

// ---- date validation ----
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function parseDate(raw: string): string | null | 'invalid' {
  const s = raw.trim();
  if (s === '') return null;
  if (DATE_RE.test(s)) return s;
  return 'invalid';
}

// ---- template download ----
function buildTemplate(): string {
  const header = TEMPLATE_COLUMNS.join(',');
  const ex1 = [
    '"STT misrecognition: customer said their account number but the IVR repeated back the wrong digits."',
    'Acme Bank',
    'CALL-001',
    '2024-01-15',
    'many',
  ].join(',');
  const ex2 = [
    '"Post-call summary missing — agent completed the call normally but no summary email was generated."',
    'Beta Corp',
    '',
    '',
    'single',
  ].join(',');
  return [header, ex1, ex2].join('\r\n') + '\r\n';
}

function downloadTemplate() {
  const blob = new Blob([buildTemplate()], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = MESSAGES.BULK_TEMPLATE_FILENAME;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- error-row CSV export ----
function buildErrorCsv(rows: ParsedRow[]): string {
  const errors = rows.filter((r) => r.status === 'error');
  const header = [...TEMPLATE_COLUMNS, 'errors'].join(',');
  const lines = errors.map((r) => {
    const fields = TEMPLATE_COLUMNS.map((c) => {
      const v = r.raw[c] ?? '';
      return v.includes(',') || v.includes('"') || v.includes('\n')
        ? `"${v.replace(/"/g, '""')}"`
        : v;
    });
    const errStr = r.reasons.join('; ');
    fields.push(`"${errStr.replace(/"/g, '""')}"`);
    return fields.join(',');
  });
  return [header, ...lines].join('\r\n') + '\r\n';
}

// ---- row validation ----
function validateRows(rawRows: string[][], existingReports: TriageReport[]): ParsedRow[] {
  return rawRows.map((fields, i) => {
    const index = i + 2; // +1 for 1-based, +1 for header row
    const raw: Record<Col, string> = {
      bug_report: fields[0] ?? '',
      customer: fields[1] ?? '',
      call_id: fields[2] ?? '',
      started_at: fields[3] ?? '',
      impact: fields[4] ?? '',
    };

    const reasons: string[] = [];
    let status: RowStatus = 'valid';

    // bug_report
    if (!raw.bug_report) {
      reasons.push('bug_report is required');
      status = 'error';
    } else if (raw.bug_report.length < VALIDATION.BUG_REPORT_MIN_CHARS) {
      reasons.push(`bug_report too short (min ${VALIDATION.BUG_REPORT_MIN_CHARS} chars)`);
      status = 'error';
    } else if (raw.bug_report.length > VALIDATION.BUG_REPORT_MAX_CHARS) {
      reasons.push(`bug_report too long (max ${VALIDATION.BUG_REPORT_MAX_CHARS} chars)`);
      status = 'error';
    }

    // customer
    if (!raw.customer) {
      reasons.push('customer is required');
      status = 'error';
    }

    // impact
    const impact = parseImpact(raw.impact);
    if (impact === null) {
      reasons.push(
        `impact "${raw.impact}" not recognised — use one of: ${IMPACT_OPTIONS.join(', ')} or ${Object.values(IMPACT_LABELS).join(', ')}`,
      );
      status = 'error';
    }

    // started_at
    let started_at: string | null = null;
    if (raw.started_at) {
      const parsed = parseDate(raw.started_at);
      if (parsed === 'invalid') {
        reasons.push(`started_at "${raw.started_at}" is not a valid date (use YYYY-MM-DD) — imported as blank`);
        if (status === 'valid') status = 'warning';
      } else {
        started_at = parsed;
      }
    }

    // duplicate detection (warning only)
    if (status !== 'error' && FEATURES.DUPLICATE_DETECTION && raw.bug_report) {
      const dup = findDuplicate(raw.bug_report, existingReports);
      if (dup) {
        reasons.push(`Looks similar to existing open report ${dup.id}`);
        if (status === 'valid') status = 'warning';
      }
    }

    const input: TriageInput | null =
      status === 'error'
        ? null
        : {
            bug_report: raw.bug_report,
            customer: raw.customer,
            call_id: raw.call_id || null,
            started_at,
            impact: impact!,
          };

    return { index, raw, input, status, reasons };
  });
}

// ---- types for import state ----
type Phase = 'idle' | 'preview' | 'importing' | 'done';

export default function BulkUpload() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [phase, setPhase] = useState<Phase>('idle');
  const [filename, setFilename] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const validRows = rows.filter((r) => r.status !== 'error');
  const errorRows = rows.filter((r) => r.status === 'error');
  const warningRows = rows.filter((r) => r.status === 'warning');

  // ---- file parse ----
  const handleFile = useCallback((file: File) => {
    setParseError(null);
    setRows([]);
    setFilename(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const raw = e.target?.result;
      if (typeof raw !== 'string') return;

      const parsed = parseCsv(raw);
      if (parsed.length === 0) {
        setParseError('The file is empty.');
        return;
      }

      // Header check
      const header = parsed[0].map((h) => h.toLowerCase().trim());
      const expected = TEMPLATE_COLUMNS as readonly string[];
      const missing = expected.filter((c) => !header.includes(c));
      const unexpected = header.filter((h) => !expected.includes(h));

      if (missing.length > 0 || unexpected.length > 0) {
        const parts: string[] = [];
        if (missing.length > 0) parts.push(`missing: ${missing.join(', ')}`);
        if (unexpected.length > 0) parts.push(`unexpected: ${unexpected.join(', ')}`);
        setParseError(`Header columns do not match the template (${parts.join('; ')}). No rows imported.`);
        return;
      }

      // Map by header position so column order is flexible.
      const colIndex = (col: string) => header.indexOf(col);
      const dataRows = parsed.slice(1);

      // Drop fully blank rows.
      const nonBlank = dataRows.filter((r) => r.some((f) => f.trim().length > 0));

      if (nonBlank.length === 0) {
        setParseError('No data rows found (the header was present but all rows were blank).');
        return;
      }

      const capped = nonBlank.slice(0, MESSAGES.BULK_MAX_ROWS);
      if (nonBlank.length > MESSAGES.BULK_MAX_ROWS) {
        setParseError(
          `File has ${nonBlank.length} rows; only the first ${MESSAGES.BULK_MAX_ROWS} will be imported.`,
        );
        // Don't return — still show the preview.
      }

      // Rearrange fields to canonical column order.
      const normalised = capped.map((row) =>
        TEMPLATE_COLUMNS.map((col) => row[colIndex(col)] ?? ''),
      );

      const existingReports = readReports();
      const validated = validateRows(normalised, existingReports);
      setRows(validated);
      setPhase('preview');
    };
    reader.readAsText(file, 'utf-8');
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = ''; // allow re-selecting the same file
  };

  // ---- import ----
  async function handleImport() {
    const toImport = rows.filter((r) => r.status !== 'error' && r.input !== null);
    if (toImport.length === 0) return;

    setPhase('importing');
    setImportProgress({ done: 0, total: toImport.length });

    const settings = readSettings();
    const usingLlm =
      FEATURES.LLM_ENABLED && settings.provider !== 'none' && settings.apiKey.trim().length > 0;

    let importedCount = 0;
    let modeTag = 'rules';

    for (let idx = 0; idx < toImport.length; idx++) {
      const row = toImport[idx];
      if (!row.input) continue;

      // Create draft (gets the next sequential ID)
      const draft = createDraft(row.input);

      // Triage — LLM calls are sequential with a delay to avoid rate limits
      const { result } = await runTriage(row.input, draft.id);

      submitReport(draft.id, result, settings.provider !== 'none' ? settings.provider : null, settings.model, filename);

      if (result.classifier_mode !== 'rules') modeTag = result.classifier_mode;
      importedCount++;
      if (mountedRef.current) setImportProgress({ done: idx + 1, total: toImport.length });

      if (usingLlm && idx < toImport.length - 1) {
        await delay(MESSAGES.BULK_LLM_DELAY_MS);
      }
    }

    // Batch activity entry — always runs even if component unmounted
    log({
      report_id: null,
      actor: ACTORS.SYSTEM,
      action: ACTIVITY_ACTIONS.BULK_IMPORTED,
      detail: `rows_total=${rows.length} imported=${importedCount} errors=${errorRows.length} warnings=${warningRows.length} mode=${modeTag} filename=${filename}`,
    });

    if (!mountedRef.current) return; // user navigated away; reports are saved, no redirect needed

    setToastMsg(`${importedCount}${MESSAGES.BULK_IMPORTED_PREFIX}`);
    setPhase('done');

    // Navigate to queue filtered to in_review
    setTimeout(() => {
      navigate(`${ROUTES.QUEUE}?status=in_review`);
    }, 1500);
  }

  // ---- error CSV download ----
  function handleDownloadErrors() {
    const csv = buildErrorCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk-errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---- reset ----
  function handleReset() {
    setPhase('idle');
    setFilename('');
    setParseError(null);
    setRows([]);
    setImportProgress(null);
    setToastMsg(null);
  }

  return (
    <div className="screen bulk-upload">
      <h1>Bulk upload</h1>

      {/* ---- step 1: template + upload zone ---- */}
      {phase === 'idle' && (
        <>
          <section className="bulk-section">
            <h2>1. Download the template</h2>
            <button type="button" className="btn" onClick={downloadTemplate}>
              Download template
            </button>
            <p className="small muted" style={{ marginTop: 'var(--s-2)' }}>
              Fill in your reports and delete the two example rows before uploading.
            </p>

            <table className="bulk-spec-table" style={{ marginTop: 'var(--s-4)' }}>
              <thead>
                <tr>
                  <th>Column</th>
                  <th>Required</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {COLUMN_SPEC.map(({ col, required, note }) => (
                  <tr key={col}>
                    <td><code>{col}</code></td>
                    <td>{required ? 'Required' : 'Optional'}</td>
                    <td>{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="bulk-section">
            <h2>2. Upload your file</h2>
            <div
              className="bulk-dropzone"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={handleInputChange}
              />
              <span>Drop a CSV here or click to browse</span>
              <span className="small muted">Max {MESSAGES.BULK_MAX_ROWS} rows per upload</span>
            </div>

            {parseError && (
              <p className="bulk-parse-error" role="alert">
                {parseError}
              </p>
            )}
          </section>
        </>
      )}

      {/* ---- step 2: preview ---- */}
      {phase === 'preview' && (
        <>
          <div className="bulk-summary">
            <span>
              <strong>{rows.length} row{rows.length !== 1 ? 's' : ''}</strong>:{' '}
              {validRows.length} valid, {errorRows.length} error{errorRows.length !== 1 ? 's' : ''},{' '}
              {warningRows.length} warning{warningRows.length !== 1 ? 's' : ''}.
            </span>
            {parseError && (
              <span className="bulk-parse-error" style={{ marginLeft: 'var(--s-4)' }}>
                {parseError}
              </span>
            )}
          </div>

          <div className="bulk-preview-actions">
            <button
              type="button"
              className="btn"
              onClick={handleImport}
              disabled={validRows.length === 0}
            >
              Import {validRows.length} report{validRows.length !== 1 ? 's' : ''}
            </button>
            {errorRows.length > 0 && (
              <button type="button" className="btn-secondary" onClick={handleDownloadErrors}>
                Download error rows as CSV
              </button>
            )}
            <button type="button" className="btn-link" onClick={handleReset}>
              Upload a different file
            </button>
          </div>

          <div className="bulk-table-wrap">
            <table className="bulk-preview-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Status</th>
                  <th>Customer</th>
                  <th>Impact</th>
                  <th>Bug report (preview)</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.index} className={`bulk-row-${row.status}`}>
                    <td className="mono">{row.index}</td>
                    <td>
                      <span className={`bulk-status bulk-status-${row.status}`}>
                        {row.status === 'valid' ? 'Valid' : row.status === 'error' ? 'Error' : 'Warning'}
                      </span>
                    </td>
                    <td>{row.raw.customer || <span className="muted">—</span>}</td>
                    <td>{row.raw.impact || <span className="muted">—</span>}</td>
                    <td className="bulk-report-preview">
                      {row.raw.bug_report.slice(0, 80)}
                      {row.raw.bug_report.length > 80 ? '…' : ''}
                    </td>
                    <td className="small muted">{row.reasons.join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ---- step 3: importing ---- */}
      {phase === 'importing' && importProgress && (
        <div className="bulk-progress">
          <p>
            Triaging {importProgress.done} of {importProgress.total}…
          </p>
          <progress value={importProgress.done} max={importProgress.total} style={{ width: '100%' }} />
        </div>
      )}

      {/* ---- done ---- */}
      {phase === 'done' && toastMsg && (
        <div className="bulk-progress">
          <p className="bulk-done-msg">{toastMsg}</p>
          <p className="small muted">Redirecting to the triage queue…</p>
        </div>
      )}
    </div>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
