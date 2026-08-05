/**
 * A dependency-free RFC-4180-ish CSV reader.
 *
 * Deliberately small: course data is a few dozen rows of text typed by a
 * human in a spreadsheet, so the only real requirements are quoted fields,
 * embedded commas/newlines, and doubled quotes.
 */
export type Row = Record<string, string>;

export function parseCsv(text: string): Row[] {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!nonEmpty.length) return [];

  const header = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((cells) => {
    const out: Row = {};
    header.forEach((h, i) => { out[h] = (cells[i] ?? '').trim(); });
    return out;
  });
}
