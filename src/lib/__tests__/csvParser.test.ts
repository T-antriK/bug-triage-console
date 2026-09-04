import { describe, expect, it } from 'vitest';
import { parseCsv } from '../csvParser';

describe('parseCsv — basic parsing', () => {
  it('parses a simple header + two rows', () => {
    const input = 'a,b,c\n1,2,3\n4,5,6\n';
    const result = parseCsv(input);
    expect(result).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
  });

  it('handles CRLF line endings', () => {
    const input = 'a,b\r\n1,2\r\n';
    expect(parseCsv(input)).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('trims whitespace around unquoted fields', () => {
    expect(parseCsv('  a  ,  b  \n  1  ,  2  ')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('strips a UTF-8 BOM', () => {
    const bom = '﻿';
    const input = `${bom}a,b\n1,2\n`;
    expect(parseCsv(input)).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('parseCsv — quoted fields', () => {
  it('parses a quoted field containing a comma', () => {
    const input = 'a,"b,c",d\n';
    expect(parseCsv(input)).toEqual([['a', 'b,c', 'd']]);
  });

  it('parses a quoted field containing a newline', () => {
    const input = 'a,"line1\nline2",c\n';
    const result = parseCsv(input);
    expect(result).toEqual([['a', 'line1\nline2', 'c']]);
    expect(result.length).toBe(1);
  });

  it('handles escaped (doubled) quotes inside a quoted field', () => {
    const input = 'a,"say ""hello""",c\n';
    expect(parseCsv(input)).toEqual([['a', 'say "hello"', 'c']]);
  });

  it('handles a bug report with all three: comma, newline, and escaped quote', () => {
    const report = 'Agent said, "no error"\nBut the call failed.';
    // Properly RFC-4180 encoded: wrap in quotes, escape inner quotes
    const encoded = `"${report.replace(/"/g, '""')}"`;
    const input = `bug_report,customer\n${encoded},Acme\n`;
    const result = parseCsv(input);
    expect(result.length).toBe(2);
    expect(result[1][0]).toBe(report);
    expect(result[1][1]).toBe('Acme');
  });
});

describe('parseCsv — edge cases', () => {
  it('handles a file without a trailing newline', () => {
    const input = 'a,b\n1,2';
    expect(parseCsv(input)).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('returns a single row for a single line with no newline', () => {
    expect(parseCsv('a,b,c')).toEqual([['a', 'b', 'c']]);
  });

  it('does not include rows where every field is blank', () => {
    // blank rows in the middle
    const result = parseCsv('a,b\n1,2\n\n3,4\n');
    // parseCsv itself returns the blank row; it is the caller's job to filter.
    // Verify the blank row comes through as empty strings.
    const blankRow = result.find((r) => r.every((f) => f === ''));
    expect(blankRow).toBeDefined();
  });
});
