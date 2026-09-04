// ============================================================
// lib/format.ts — presentation-only helpers. No classification logic,
// no storage. Format strings and delimiters come from config.ts.
// ============================================================

import { DATE_FORMAT, EXPORT } from '../config';

const dtf = new Intl.DateTimeFormat(
  DATE_FORMAT.LOCALE,
  DATE_FORMAT.OPTIONS as Intl.DateTimeFormatOptions,
);

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return dtf.format(d);
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

/** A cell value that might be an array, boolean, null, etc -> string. */
export function cellToString(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map((v) => cellToString(v)).join('; ');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function escapeField(value: string, delimiter: string): string {
  const needsQuote =
    value.includes(delimiter) ||
    value.includes(EXPORT.QUOTE) ||
    value.includes('\n') ||
    value.includes('\r');
  if (!needsQuote) return value;
  return EXPORT.QUOTE + value.split(EXPORT.QUOTE).join(EXPORT.QUOTE + EXPORT.QUOTE) + EXPORT.QUOTE;
}

export function toDelimited(
  columns: readonly string[],
  rows: ReadonlyArray<Record<string, unknown>>,
  delimiter: string,
): string {
  const head = columns.map((c) => escapeField(c, delimiter)).join(delimiter);
  const body = rows.map((row) =>
    columns.map((c) => escapeField(cellToString(row[c]), delimiter)).join(delimiter),
  );
  return [head, ...body].join(EXPORT.ROW_SEPARATOR);
}

export function toCSV(
  columns: readonly string[],
  rows: ReadonlyArray<Record<string, unknown>>,
): string {
  return toDelimited(columns, rows, EXPORT.CSV_DELIMITER);
}

export function toTSV(
  columns: readonly string[],
  rows: ReadonlyArray<Record<string, unknown>>,
): string {
  return toDelimited(columns, rows, EXPORT.TSV_DELIMITER);
}

export function downloadCSV(name: string, csv: string): void {
  const blob = new Blob([csv], { type: EXPORT.CSV_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = EXPORT.FILENAME_PREFIX + name + EXPORT.FILENAME_SUFFIX;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
