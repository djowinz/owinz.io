import { JSON_SCHEMA, load } from "js-yaml";
import { PALETTE, type PaletteName } from "./palette";
import { parseNumber, parseTable, toCsv, xKindOf, type XKind } from "./table";

export type ChartType = "line" | "bar" | "area" | "scatter" | "pie";
export type Layout = "single" | "stacked" | "dual";

export interface SeriesSpec {
  name: string;
  color: PaletteName;
  axis: "left" | "right";
  unit?: string;
}
export interface Marker {
  x: string;
  label: string;
}
export interface ChartSpec {
  type: ChartType;
  layout: Layout;
  title?: string;
  caption?: string;
  x: { name: string; label?: string; kind: XKind };
  series: SeriesSpec[];
  markers: Marker[];
  /** values[i] belongs to series[i]. */
  rows: { x: string; values: (number | null)[] }[];
}
export type ParseResult =
  | { ok: true; spec: ChartSpec; warnings: string[] }
  | { ok: false; errors: string[] };

const TYPES: readonly string[] = ["line", "bar", "area", "scatter", "pie"];
const LAYOUTS: readonly string[] = ["single", "stacked", "dual"];
const DATE_LIKE = /^\d{4}-\d{2}(-\d{2})?$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** YAML under JSON_SCHEMA types `2026` as a number; string fields want the text. */
function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v);
  return s === "" ? undefined : s;
}

/** Default axis: the second series of a dual chart sits on the right. */
function defaultAxis(layout: Layout, index: number): "left" | "right" {
  return layout === "dual" && index === 1 ? "right" : "left";
}

/** `source` is the text inside the fence: YAML header, a `---` line, then CSV. */
export function parseChart(source: string): ParseResult {
  const lines = source.split("\n");
  const sep = lines.findIndex((l) => l.replace(/\r$/, "") === "---");
  if (sep === -1) return { ok: false, errors: ["Missing the --- line between settings and data."] };

  let header: unknown;
  try {
    header = load(lines.slice(0, sep).join("\n"), { schema: JSON_SCHEMA }) ?? {};
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
    return { ok: false, errors: [`Settings aren't valid YAML: ${msg}`] };
  }
  if (!isObj(header)) return { ok: false, errors: ["Settings must be a list of key: value lines."] };

  const table = parseTable(lines.slice(sep + 1).join("\n"));
  if (!table.ok) return { ok: false, errors: table.errors };

  const errors: string[] = [];
  const warnings: string[] = [];

  const type = header.type;
  if (typeof type !== "string" || !TYPES.includes(type)) {
    errors.push(`type must be one of ${TYPES.join(", ")}.`);
  }
  const layout = header.layout ?? "single";
  if (typeof layout !== "string" || !LAYOUTS.includes(layout)) {
    errors.push(`layout must be one of ${LAYOUTS.join(", ")}.`);
  }

  const [xName, ...seriesNames] = table.columns;
  if (layout === "dual" && seriesNames.length !== 2) {
    errors.push("dual layout needs exactly 2 series.");
  }

  const known = new Set(["type", "layout", "title", "caption", "x", "series", "markers"]);
  for (const k of Object.keys(header)) if (!known.has(k)) warnings.push(`unknown setting "${k}"`);

  const xs = isObj(header.x) ? header.x : {};
  const seriesCfg = isObj(header.series) ? header.series : {};
  for (const k of Object.keys(seriesCfg)) {
    if (!seriesNames.includes(k)) errors.push(`series "${k}" isn't a column`);
  }

  const lay = (LAYOUTS.includes(layout as string) ? layout : "single") as Layout;
  const series: SeriesSpec[] = seriesNames.map((name, i) => {
    const raw = seriesCfg[name];
    const cfg = isObj(raw) ? raw : {};
    for (const k of Object.keys(cfg)) {
      if (!["color", "axis", "unit"].includes(k)) warnings.push(`unknown setting "${k}" in series "${name}"`);
    }
    const color = cfg.color ?? PALETTE[i % PALETTE.length];
    if (typeof color !== "string" || !(PALETTE as readonly string[]).includes(color)) {
      errors.push(`color "${String(color)}" isn't a palette color (${PALETTE.join(", ")}).`);
    }
    const axis = cfg.axis ?? defaultAxis(lay, i);
    if (axis !== "left" && axis !== "right") errors.push(`axis for "${name}" must be left or right.`);
    return {
      name,
      color: color as PaletteName,
      axis: axis as "left" | "right",
      ...(str(cfg.unit) !== undefined && { unit: str(cfg.unit) }),
    };
  });

  const rows = table.rows.map((r, ri) => ({
    x: r[0],
    values: series.map((s, si) => {
      const cell = r[si + 1];
      const n = parseNumber(cell);
      if (n === undefined) errors.push(`"${cell}" in ${s.name} isn't a number (row ${ri + 2})`);
      return n ?? null;
    }),
  }));
  series.forEach((s, si) => {
    if (rows.every((r) => r.values[si] === null)) errors.push(`${s.name} has no numbers.`);
  });

  const kind = xKindOf(rows.map((r) => r.x));
  const markers: Marker[] = [];
  const rawMarkers = header.markers ?? [];
  if (!Array.isArray(rawMarkers)) {
    errors.push("markers must be a list.");
  } else {
    for (const m of rawMarkers) {
      const x = isObj(m) ? str(m.x) : undefined;
      const label = isObj(m) ? str(m.label) : undefined;
      if (x === undefined || label === undefined) {
        errors.push("Each marker needs an x and a label.");
        continue;
      }
      markers.push({ x, label });
      if (type === "pie") continue;
      if (kind === "time") {
        if (!DATE_LIKE.test(x)) errors.push(`marker "${label}" needs a date for x.`);
      } else if (kind === "category" && !rows.some((r) => r.x === x)) {
        errors.push(`marker "${label}" doesn't match any row`);
      }
    }
    if (type === "pie" && markers.length) errors.push("markers don't work on pie charts.");
  }

  if (errors.length) return { ok: false, errors };

  const title = str(header.title);
  const caption = str(header.caption);
  const xLabel = str(xs.label);
  return {
    ok: true,
    warnings,
    spec: {
      type: type as ChartType,
      layout: lay,
      ...(title !== undefined && { title }),
      ...(caption !== undefined && { caption }),
      x: { name: xName, ...(xLabel !== undefined && { label: xLabel }), kind },
      series,
      markers,
      rows,
    },
  };
}

/**
 * Quote only when YAML would misread the text: special leading characters,
 * `: ` or ` #`, edge spaces, flow punctuation, or a scalar that loads as a
 * non-string (number, bool, null). Dates stay plain under JSON_SCHEMA.
 */
function scalar(s: string, flow: boolean): string {
  const risky =
    s === "" ||
    s !== s.trim() ||
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(s) ||
    /: |:$| #|[\n\r\t]/.test(s) ||
    (flow && /[,[\]{}]/.test(s));
  if (!risky) {
    try {
      if (load(s, { schema: JSON_SCHEMA }) === s) return s;
    } catch {
      /* fall through to quoting */
    }
  }
  return JSON.stringify(s);
}

/** Canonical text for the inside of a chart fence. Defaults are left out. */
export function serializeChart(spec: ChartSpec): string {
  const out: string[] = [`type: ${spec.type}`];
  if (spec.layout !== "single") out.push(`layout: ${spec.layout}`);
  if (spec.title) out.push(`title: ${scalar(spec.title, false)}`);
  if (spec.caption) out.push(`caption: ${scalar(spec.caption, false)}`);
  if (spec.x.label) out.push(`x: { label: ${scalar(spec.x.label, true)} }`);

  const seriesLines: string[] = [];
  spec.series.forEach((s, i) => {
    const parts: string[] = [];
    if (s.color !== PALETTE[i % PALETTE.length]) parts.push(`color: ${s.color}`);
    if (s.axis !== defaultAxis(spec.layout, i)) parts.push(`axis: ${s.axis}`);
    if (s.unit) parts.push(`unit: ${scalar(s.unit, true)}`);
    if (parts.length) seriesLines.push(`  ${scalar(s.name, false)}: { ${parts.join(", ")} }`);
  });
  if (seriesLines.length) out.push("series:", ...seriesLines);

  if (spec.markers.length) {
    out.push("markers:");
    for (const m of spec.markers) {
      out.push(`  - x: ${scalar(m.x, false)}`, `    label: ${scalar(m.label, false)}`);
    }
  }

  out.push("---");
  const columns = [spec.x.name, ...spec.series.map((s) => s.name)];
  const rows = spec.rows.map((r) => [r.x, ...r.values.map((v) => (v === null ? "" : String(v)))]);
  out.push(toCsv(columns, rows));
  return out.join("\n");
}

/** Fences whose info string is exactly `chart`. Group 1 is the inner text. */
export const CHART_FENCE = /^```chart[ \t]*\n([\s\S]*?)\n```[ \t]*$/gm;

export function chartSources(markdown: string): string[] {
  // Fresh RegExp: a shared /g regex would carry lastIndex between calls.
  const re = new RegExp(CHART_FENCE.source, CHART_FENCE.flags);
  return Array.from(markdown.matchAll(re), (m) => m[1]);
}
