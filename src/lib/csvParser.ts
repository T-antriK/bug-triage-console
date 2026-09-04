/**
 * RFC-4180-aware CSV parser. Handles quoted fields containing commas,
 * newlines and doubled-quote escapes (""). Strips a UTF-8 BOM if present.
 * Returns an array of string arrays (rows of fields). Blank rows are
 * included so callers can decide whether to skip them.
 */
export function parseCsv(raw: string): string[][] {
  // Strip UTF-8 BOM (U+FEFF) that Excel adds on save-as CSV.
  const input = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuote = false;
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (inQuote) {
      if (ch === '"') {
        // Peek ahead: doubled quote is an escaped quote inside a field.
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          // Closing quote — field ends; consume the quote, stay in row.
          inQuote = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
        i++;
      } else if (ch === ',') {
        row.push(field.trim());
        field = '';
        i++;
      } else if (ch === '\r' && input[i + 1] === '\n') {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = '';
        i += 2;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = '';
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Flush the last field/row (file may not end with a newline).
  row.push(field.trim());
  if (row.some((f) => f.length > 0)) rows.push(row);

  return rows;
}
