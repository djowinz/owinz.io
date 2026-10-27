// The chart dialog's model (components/admin/editor/ChartDialog.tsx): pasted
// data plus the writer's settings become a ChartSpec draft, checked by the
// same parser as everything else. Pure, so it's unit-tested.
import { PALETTE, type PaletteName } from "./palette";
import { parseChart, serializeChart, type ChartSpec, type ChartType, type Layout, type Marker } from "./spec";
import { parseTable, suggestType, toCsv, xKindOf, type XKind } from "./table";

export interface ChartSettings {
  /** Unset until the writer picks one; the suggestion applies meanwhile. */
  type?: ChartType;
  layout: Layout;
  title: string;
  caption: string;
  xLabel: string;
  /** Keyed by series name, so they survive a re-paste. */
  colors: Record<string, PaletteName>;
  units: Record<string, string>;
  /** From an edited block; used on a two-axes layout, else the default axis. */
  axes: Record<string, "left" | "right">;
  markers: Marker[];
}

export type Analysis =
  | {
      ok: true;
      columns: string[];
      rows: string[][];
      xKind: XKind;
      suggestion: { type: ChartType; reason: string };
    }
  | { ok: false; errors: string[] };

export type Draft = { ok: true; spec: ChartSpec; source: string } | { ok: false; errors: string[] };

export const emptySettings = (): ChartSettings => ({
  layout: "single",
  title: "",
  caption: "",
  xLabel: "",
  colors: {},
  units: {},
  axes: {},
  markers: [],
});

export function analyzeData(text: string): Analysis {
  const table = parseTable(text);
  if (!table.ok) return table;
  const xKind = xKindOf(table.rows.map((r) => r[0]));
  const suggestion = suggestType(xKind, table.columns.length - 1, table.rows.length);
  return { ok: true, columns: table.columns, rows: table.rows, xKind, suggestion };
}

const KIND_WORD: Record<XKind, string> = { time: "dates", number: "numbers", category: "categories" };

/** "26 rows · x-axis week (dates) · series Lead time (days), MTTR (hours)" */
export function summarize(a: Extract<Analysis, { ok: true }>): string {
  const [x, ...series] = a.columns;
  return `${a.rows.length} rows · x-axis ${x} (${KIND_WORD[a.xKind]}) · series ${series.join(", ")}`;
}

/** Layouts that don't fit the series count fall back to one chart. */
export function effectiveLayout(layout: Layout, seriesCount: number): Layout {
  if (seriesCount < 2) return "single";
  if (layout === "dual" && seriesCount !== 2) return "single";
  return layout;
}

const optional = <K extends string>(key: K, value: string) => {
  const v = value.trim();
  return (v ? { [key]: v } : {}) as Partial<Record<K, string>>;
};

export function buildDraft(a: Extract<Analysis, { ok: true }>, settings: ChartSettings): Draft {
  const [xName, ...names] = a.columns;
  const layout = effectiveLayout(settings.layout, names.length);
  // The settings only; the pasted cells go in as text, so parseChart checks them.
  const header: ChartSpec = {
    type: settings.type ?? a.suggestion.type,
    layout,
    ...optional("title", settings.title),
    ...optional("caption", settings.caption),
    x: { name: xName, ...optional("label", settings.xLabel), kind: a.xKind },
    series: names.map((name, i) => ({
      name,
      color: settings.colors[name] ?? PALETTE[i % PALETTE.length],
      // Axes only mean something on two axes; there a hand-written choice is kept.
      axis: layout === "dual" ? (settings.axes[name] ?? (i === 1 ? "right" : "left")) : "left",
      ...optional("unit", settings.units[name] ?? ""),
    })),
    // A row left fully blank is ignored; a half-filled one is an error.
    markers: settings.markers
      .map((m) => ({ x: m.x.trim(), label: m.label.trim() }))
      .filter((m) => m.x || m.label),
    rows: [],
  };
  // No header line can be `---` (serializeChart quotes leading dashes), so the first one is the separator.
  const settingsText = serializeChart(header);
  const yaml = settingsText.slice(0, settingsText.indexOf("\n---\n"));
  const parsed = parseChart(`${yaml}\n---\n${toCsv(a.columns, a.rows)}`);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  return { ok: true, spec: parsed.spec, source: serializeChart(parsed.spec) };
}

/** Edit mode: an existing block's CSV (the text after the `---` line) and settings. */
export function fromSource(source: string): { csv: string; settings: ChartSettings } {
  const lines = source.split("\n");
  const csv = lines.slice(lines.findIndex((l) => l.replace(/\r$/, "") === "---") + 1).join("\n");
  const parsed = parseChart(source);
  if (!parsed.ok) return { csv, settings: emptySettings() };
  const { spec } = parsed;
  return {
    csv,
    settings: {
      type: spec.type,
      layout: spec.layout,
      title: spec.title ?? "",
      caption: spec.caption ?? "",
      xLabel: spec.x.label ?? "",
      colors: Object.fromEntries(spec.series.map((s) => [s.name, s.color])),
      units: Object.fromEntries(spec.series.flatMap((s) => (s.unit ? [[s.name, s.unit]] : []))),
      axes: Object.fromEntries(spec.series.map((s) => [s.name, s.axis])),
      markers: spec.markers.map((m) => ({ ...m })),
    },
  };
}
