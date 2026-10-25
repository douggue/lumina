export type StatementRow = { reference: string; amount: number; date?: string };

/**
 * Parse a statement exported as CSV. Finds the reference, amount and date columns by header name
 * (English, French or Kreyòl), accepting comma or semicolon separators and "1 250,00" / "1,250.00" amounts.
 */
export function parseStatement(text: string): { rows: StatementRow[]; error?: string } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], error: "The file needs a header row and at least one payment" };
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const split = (l: string) => {
    const out: string[] = [];
    let cur = "", q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === sep && !q) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const find = (re: RegExp) => head.findIndex((h) => re.test(h));
  const ri = find(/ref|transaction|tranzaksyon|id/);
  const ai = find(/amount|montant|montan|kantite|total/);
  const di = find(/date|dat/);
  if (ri < 0 || ai < 0) return { rows: [], error: "Couldn't find the reference and amount columns. Name them e.g. “reference” and “amount”." };
  const rows: StatementRow[] = [];
  for (const l of lines.slice(1)) {
    const c = split(l);
    const reference = (c[ri] ?? "").toUpperCase().replace(/\s/g, "");
    let raw = (c[ai] ?? "").replace(/[^\d.,-]/g, "");
    if (/,\d{2}$/.test(raw)) raw = raw.replace(/\./g, "").replace(",", ".");
    else raw = raw.replace(/,/g, "");
    const amount = Math.round(Math.abs(Number(raw)) * 100);
    if (reference && Number.isFinite(amount) && amount > 0) rows.push({ reference, amount, date: di >= 0 ? c[di] : undefined });
  }
  return { rows };
}
