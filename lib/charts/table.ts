import type { ChartType } from "./spec";

export type ParsedTable =
  | { ok: true; columns: string[]; rows: string[][] }
  | { ok: false; errors: string[] };

export type XKind = "time" | "number" | "category";

/**
 * Split text into records of cells. Quotes only open at the start of a cell
 * (RFC 4180), so `5" pipe` stays literal; inside quotes, `""` is one quote
 * and delimiters and newlines are plain text.
 */
function splitRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let cellStart = true;

  const endCell = () => {
    row.push(cell.trim());
    cell = "";
    cellStart = true;
  };
  const endRow = () => {
    endCell();
    records.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"' && cellStart) {
      quoted = true;
      cellStart = false;
    } else if (ch === delimiter) {
      endCell();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else {
      cell += ch;
      cellStart = false;
    }
  }
  endRow();
  return records;
}

/** Parse pasted spreadsheet cells (TSV) or CSV into a header and data rows. */
export function parseTable(text: string): ParsedTable {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  const records = splitRecords(text, delimiter).filter((r) => r.some((c) => c !== ""));

  const [columns, ...rows] = records;
  if (!columns || columns.length < 2) {
    return { ok: false, errors: ["Need at least two columns."] };
  }
  if (rows.length < 2) {
    return { ok: false, errors: ["Need a header row and at least two rows of data."] };
  }
  const errors: string[] = [];
  rows.forEach((r, i) => {
    if (r.length !== columns.length) {
      errors.push(`Every row needs ${columns.length} cells, but row ${i + 2} has ${r.length}.`);
    }
  });
  return errors.length ? { ok: false, errors } : { ok: true, columns, rows };
}

/** "" is a gap (null), a number-like cell is its value, anything else is undefined. */
export function parseNumber(cell: string): number | null | undefined {
  const s = cell.replace(/[\s,$%]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

const DATE_LIKE = /^\d{4}-\d{2}(-\d{2})?$/;

export function xKindOf(values: string[]): XKind {
  if (values.every((v) => DATE_LIKE.test(v))) return "time";
  if (values.every((v) => typeof parseNumber(v) === "number")) return "number";
  return "category";
}

/** A starting chart type for the dialog; the writer can always change it. */
export function suggestType(
  xKind: XKind,
  seriesCount: number,
  rowCount: number,
): { type: ChartType; reason: string } {
  void seriesCount;
  void rowCount;
  if (xKind === "time") return { type: "line", reason: "line, because x is dates" };
  if (xKind === "number") return { type: "line", reason: "line, because x is numbers" };
  return { type: "bar", reason: "bar, because x is categories" };
}

function csvCell(cell: string): string {
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

export function toCsv(columns: string[], rows: string[][]): string {
  return [columns, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}
