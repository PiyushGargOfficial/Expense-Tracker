/**
 * Escapes one CSV cell. Cells starting with = + - @ (or tab/CR) would be run as formulas by Excel/Sheets
 * ("CSV injection"), so they get a leading apostrophe. Plain negative numbers are left alone.
 */
export function csvCell(v: string): string {
  const risky = /^[=+\-@\t\r]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v);
  const safe = risky ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Small RFC-4180 style parser (quotes, escaped quotes, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
