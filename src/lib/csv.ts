// Minimal CSV writer — proper RFC4180 escaping (quotes fields containing a
// comma, quote, or newline; doubles any embedded quotes). Used by the
// Purchases/Sales bulk-export routes. Kept dependency-free since this is a
// small, one-directional need (values -> CSV text); bulk *import* (parsing
// a CSV a user uploads, which needs to tolerate messier real-world files)
// uses the papaparse package instead — see BulkImportPartiesClient.tsx.

function escapeCsvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  // Leading BOM so Excel opens UTF-8 (₹ symbol, etc.) correctly instead of
  // guessing a legacy codepage.
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
