import type { ChartSpec, Marker } from "./spec";
import { parseNumber } from "./table";

type Kind = ChartSpec["x"]["kind"];

/** Convert an x cell by the axis kind: time -> UTC ms, number -> number, else the text. NaN when unusable. */
function convertX(kind: Kind, x: string): number | string {
  if (kind === "category") return x;
  if (kind === "number") return parseNumber(x) ?? Number.NaN;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(x);
  if (!m) return Number.NaN;
  const month = Number(m[2]);
  const day = m[3] ? Number(m[3]) : 1;
  const t = Date.UTC(Number(m[1]), month - 1, day);
  // Date.UTC rolls 2026-99-99 over into a real date; reject anything that did not round-trip.
  const d = new Date(t);
  return d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? t : Number.NaN;
}

/** Rows as Recharts wants them: `x` plus `s0..sN`. Rows whose numeric/time x can't be read are dropped. */
export function toRechartsRows(spec: ChartSpec): Record<string, number | string | null>[] {
  const rows: Record<string, number | string | null>[] = [];
  for (const row of spec.rows) {
    const x = convertX(spec.x.kind, row.x);
    if (typeof x === "number" && Number.isNaN(x)) continue;
    const out: Record<string, number | string | null> = { x };
    spec.series.forEach((_, i) => {
      out[`s${i}`] = row.values[i] ?? null;
    });
    rows.push(out);
  }
  return rows;
}

/** A marker's x, converted like the rows. NaN when unreadable: callers skip those markers. */
export function markerX(spec: ChartSpec, marker: Marker): number | string {
  return convertX(spec.x.kind, marker.x);
}
