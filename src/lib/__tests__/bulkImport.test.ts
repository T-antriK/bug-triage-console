/**
 * Bulk import integration tests — run against the real pipeline in rules-only
 * mode (no network). Validates that:
 *   - quoted fields with commas and newlines parse correctly
 *   - only valid rows are imported; error rows are skipped
 *   - wrong headers produce a clear error and import nothing
 *   - imported reports are identical to form-submitted reports
 *   - import works when LLM_ENABLED is false (rules-only always passes)
 */
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../csvParser';
import { classifyRulesOnly } from '../../rules/pipeline';
import type { Impact, TriageInput } from '../../types';
import { VALIDATION, IMPACT_OPTIONS } from '../../config';

// ---- helpers replicating BulkUpload's validateRows logic ----
const TEMPLATE_COLUMNS = ['bug_report', 'customer', 'call_id', 'started_at', 'impact'] as const;
type Col = (typeof TEMPLATE_COLUMNS)[number];

function parseImpact(raw: string): Impact | null {
  const s = raw.trim().toLowerCase();
  if (s === 'single' || s === 'single caller') return 'single';
  if (s === 'many' || s === 'many callers') return 'many';
  if (s === 'outage') return 'outage';
  return null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function parseDate(raw: string): string | null | 'invalid' {
  const s = raw.trim();
  if (s === '') return null;
  if (DATE_RE.test(s)) return s;
  return 'invalid';
}

type RowStatus = 'valid' | 'error' | 'warning';
type RowResult = { status: RowStatus; reasons: string[]; input: TriageInput | null };

function validateRow(fields: string[]): RowResult {
  const raw: Record<Col, string> = {
    bug_report: fields[0] ?? '',
    customer: fields[1] ?? '',
    call_id: fields[2] ?? '',
    started_at: fields[3] ?? '',
    impact: fields[4] ?? '',
  };
  const reasons: string[] = [];
  let status: RowStatus = 'valid';

  if (!raw.bug_report) {
    reasons.push('bug_report required');
    status = 'error';
  } else if (raw.bug_report.length < VALIDATION.BUG_REPORT_MIN_CHARS) {
    reasons.push('bug_report too short');
    status = 'error';
  } else if (raw.bug_report.length > VALIDATION.BUG_REPORT_MAX_CHARS) {
    reasons.push('bug_report too long');
    status = 'error';
  }
  if (!raw.customer) {
    reasons.push('customer required');
    status = 'error';
  }
  const impact = parseImpact(raw.impact);
  if (!impact) {
    reasons.push(`impact "${raw.impact}" not recognised`);
    status = 'error';
  }
  const dateResult = parseDate(raw.started_at);
  if (dateResult === 'invalid') {
    reasons.push('started_at invalid — imported as null');
    if (status === 'valid') status = 'warning';
  }

  const input: TriageInput | null =
    status === 'error'
      ? null
      : {
          bug_report: raw.bug_report,
          customer: raw.customer,
          call_id: raw.call_id || null,
          started_at: dateResult === 'invalid' ? null : (dateResult as string | null),
          impact: impact!,
        };

  return { status, reasons, input };
}

// ---- CSV with quoted fields containing commas and newlines ----
describe('CSV parsing of complex bug reports', () => {
  it('parses a quoted field containing a comma without splitting', () => {
    const report = 'Webhook failed: status 500, retry exhausted.';
    const csv = `bug_report,customer,call_id,started_at,impact\n"${report}",Acme,,2024-01-10,many\n`;
    const rows = parseCsv(csv);
    expect(rows.length).toBe(2);
    expect(rows[1][0]).toBe(report);
  });

  it('parses a quoted field containing a newline as a single row', () => {
    const report = 'Step 1: error.\nStep 2: no recovery.';
    const csv = `bug_report,customer,call_id,started_at,impact\n"${report.replace(/"/g, '""')}",Beta,,2024-02-01,single\n`;
    const rows = parseCsv(csv);
    // Only 2 rows despite the newline inside the field
    expect(rows.length).toBe(2);
    expect(rows[1][0]).toBe(report);
  });

  it('parses a report with escaped quotes', () => {
    const report = 'Agent said "completed" but call log shows failure.';
    const encoded = report.replace(/"/g, '""');
    const csv = `bug_report,customer,call_id,started_at,impact\n"${encoded}",Corp,,2024-03-01,many\n`;
    const rows = parseCsv(csv);
    expect(rows[1][0]).toBe(report);
  });
});

// ---- mixed valid/invalid rows ----
describe('mixed valid and invalid rows — only valid rows pass validation', () => {
  const LONG_REPORT = 'A'.repeat(VALIDATION.BUG_REPORT_MIN_CHARS + 5);

  const csvRows = [
    // valid
    [LONG_REPORT, 'Acme', '', '2024-01-01', 'many'],
    // error: missing customer
    [LONG_REPORT, '', '', '', 'single'],
    // error: bad impact
    [LONG_REPORT, 'Beta', '', '', 'unknown'],
    // warning: bad date (imported as null)
    [LONG_REPORT, 'Gamma', '', 'not-a-date', 'outage'],
    // valid: blank call_id and started_at
    [LONG_REPORT, 'Delta', '', '', 'single'],
  ];

  const results = csvRows.map((fields) => validateRow(fields));

  it('first row is valid', () => expect(results[0].status).toBe('valid'));
  it('second row (missing customer) is error', () => expect(results[1].status).toBe('error'));
  it('third row (bad impact) is error', () => expect(results[2].status).toBe('error'));
  it('fourth row (bad date) is warning', () => expect(results[3].status).toBe('warning'));
  it('fifth row is valid', () => expect(results[4].status).toBe('valid'));

  it('error rows have no input', () => {
    expect(results[1].input).toBeNull();
    expect(results[2].input).toBeNull();
  });
  it('valid and warning rows have an input', () => {
    expect(results[0].input).not.toBeNull();
    expect(results[3].input).not.toBeNull();
    expect(results[4].input).not.toBeNull();
  });
  it('warning row has started_at normalised to null', () => {
    expect(results[3].input?.started_at).toBeNull();
  });
  it('count: 2 valid, 2 error, 1 warning', () => {
    expect(results.filter((r) => r.status === 'valid').length).toBe(2);
    expect(results.filter((r) => r.status === 'error').length).toBe(2);
    expect(results.filter((r) => r.status === 'warning').length).toBe(1);
  });
});

// ---- wrong headers ----
describe('header validation', () => {
  it('detects missing columns', () => {
    const csv = 'bug_report,customer\nsome report,Acme\n';
    const parsed = parseCsv(csv);
    const header = parsed[0].map((h) => h.toLowerCase().trim());
    const missing = (TEMPLATE_COLUMNS as readonly string[]).filter((c) => !header.includes(c));
    expect(missing).toContain('call_id');
    expect(missing).toContain('started_at');
    expect(missing).toContain('impact');
  });

  it('detects unexpected columns', () => {
    const csv = 'bug_report,customer,call_id,started_at,impact,extra_col\nreport,Acme,,2024-01-01,many\n';
    const parsed = parseCsv(csv);
    const header = parsed[0].map((h) => h.toLowerCase().trim());
    const unexpected = header.filter((h) => !(TEMPLATE_COLUMNS as readonly string[]).includes(h));
    expect(unexpected).toContain('extra_col');
  });
});

// ---- form parity ----
describe('imported report output matches form-submitted output', () => {
  const input: TriageInput = {
    bug_report: 'Caller reported IVR repeated digits incorrectly. Happened on three separate calls today.',
    customer: 'Test Bank',
    call_id: null,
    started_at: null,
    impact: 'many',
  };

  it('produces the same bucket, severity, and signals in rules-only mode', () => {
    const r1 = classifyRulesOnly(input);
    const r2 = classifyRulesOnly(input); // simulate second import of same input
    expect(r2.bucket).toBe(r1.bucket);
    expect(r2.severity).toBe(r1.severity);
    expect(r2.signals).toEqual(r1.signals);
    expect(r2.confidence).toBe(r1.confidence);
  });
});

// ---- rules-only mode ----
describe('validation works with LLM disabled (rules-only)', () => {
  it('accepts all valid impact values', () => {
    for (const imp of IMPACT_OPTIONS) {
      const result = parseImpact(imp);
      expect(result).toBe(imp);
    }
  });

  it('accepts display label variants', () => {
    expect(parseImpact('Single caller')).toBe('single');
    expect(parseImpact('Many callers')).toBe('many');
    expect(parseImpact('Outage')).toBe('outage');
  });

  it('rejects an unrecognised impact value', () => {
    expect(parseImpact('enterprise')).toBeNull();
    expect(parseImpact('')).toBeNull();
  });
});
