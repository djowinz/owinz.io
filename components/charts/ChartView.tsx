"use client";

// Interactive rendering of a ChartSpec. Loaded only on pages that contain a
// chart (ArticleHtml dynamic-imports it), so Recharts stays out of other bundles.
import { useId, type ReactElement } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CHART_HEIGHT,
  PANEL_GAP,
  PANEL_HEIGHT,
  PANEL_LABEL_GAP,
  PANEL_LABEL_HEIGHT,
  PIE_HEIGHT,
} from "@/lib/charts/layout";
import { PALETTE, colorVar } from "@/lib/charts/palette";
import { markerX, toRechartsRows } from "@/lib/charts/recharts-data";
import type { ChartSpec } from "@/lib/charts/spec";

type Row = Record<string, number | string | null>;

const INK = "var(--foreground)";
const MUTED = "var(--muted)";
const EDGE = "var(--edge)";
const MONO = "var(--font-geist-mono, ui-monospace, monospace)";
const TICK = { fill: MUTED, fontFamily: MONO, fontSize: 11 };

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const withUnit = (n: number, unit?: string) =>
  !unit ? num(n) : /^[%°]/.test(unit) ? `${num(n)}${unit}` : `${num(n)} ${unit}`;

const DAY = 86_400_000;
function timeFormatter(rows: Row[]) {
  const xs = rows.map((r) => r.x).filter((x): x is number => typeof x === "number");
  const span = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  const long = span > 300 * DAY;
  return (t: number) =>
    new Date(t).toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "short",
      ...(long ? { year: "2-digit" } : { day: "numeric" }),
    });
}
const fullDate = (t: number) =>
  new Date(t).toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" });

interface PanelProps {
  spec: ChartSpec;
  rows: Row[];
  /** Indexes into spec.series drawn by this panel. */
  indexes: number[];
  height: number;
  syncId?: string;
  showLegend: boolean;
  showMarkerLabels: boolean;
  /** Draw spec.x.label under the x axis (stacked panels: the last one only). */
  showXLabel: boolean;
}

function Panel({ spec, rows, indexes, height, syncId, showLegend, showMarkerLabels, showXLabel }: PanelProps) {
  const timeAxis = spec.x.kind === "time";
  const numericAxis = spec.x.kind !== "category" && spec.type !== "bar";
  const dual = spec.layout === "dual";
  const axisOf = (i: number) => (dual ? spec.series[i].axis : "left");
  const unitOf = (id: "left" | "right") =>
    indexes.map((i) => spec.series[i]).find((s) => (dual ? s.axis : "left") === id && s.unit)?.unit;

  const xLabel = showXLabel ? spec.x.label : undefined;
  const fmtTime = timeFormatter(rows);
  const xTick = timeAxis ? fmtTime : undefined;
  const xValues = new Set(rows.map((r) => r.x));
  const markers = spec.markers
    .map((m) => ({ ...m, at: markerX(spec, m) }))
    .filter((m) => !(typeof m.at === "number" && Number.isNaN(m.at)))
    // A category axis can only place a line on a category that exists.
    .filter((m) => numericAxis || xValues.has(m.at));

  const tooltip = (
    <Tooltip
      cursor={{ stroke: EDGE }}
      contentStyle={{
        background: "var(--background)",
        border: `1px solid ${EDGE}`,
        borderRadius: 4,
        color: INK,
        fontFamily: MONO,
        fontSize: 12,
      }}
      labelStyle={{ color: INK }}
      itemStyle={{ color: INK }}
      labelFormatter={(l) => (timeAxis && typeof l === "number" ? fullDate(l) : String(l))}
      formatter={(v, _name, item) => {
        const s = spec.series.find((x) => x.name === item.name);
        // Scatter tooltips also list the x entry, which is not a series.
        if (!s && timeAxis && typeof v === "number") return fullDate(v);
        return typeof v === "number" ? withUnit(v, s?.unit) : String(v ?? "");
      }}
    />
  );

  const xAxis = (
    <XAxis
      dataKey="x"
      type={numericAxis ? "number" : "category"}
      scale={numericAxis ? (timeAxis ? "time" : "linear") : "auto"}
      domain={numericAxis ? ["dataMin", "dataMax"] : undefined}
      tickFormatter={(v) => (xTick && typeof v === "number" ? xTick(v) : String(v))}
      tick={TICK}
      tickLine={false}
      axisLine={{ stroke: EDGE }}
      stroke={EDGE}
      minTickGap={24}
      // Category scatter: each series repeats the x values; keep one tick per category.
      allowDuplicatedCategory={spec.type === "scatter" && !numericAxis ? false : undefined}
      // A taller axis (default 30) leaves room for the label under the ticks,
      // above any legend, which Recharts places below the axis.
      height={xLabel ? 48 : 30}
      label={
        xLabel
          ? { value: xLabel, position: "insideBottom", offset: 2, fill: MUTED, fontFamily: MONO, fontSize: 11 }
          : undefined
      }
    />
  );
  const yAxes = (dual ? (["left", "right"] as const) : (["left"] as const)).map((id) => (
    <YAxis
      key={id}
      yAxisId={id}
      orientation={id}
      tick={TICK}
      tickLine={false}
      axisLine={false}
      width={56}
      tickFormatter={(v) => (typeof v === "number" ? withUnit(v, unitOf(id)) : String(v))}
    />
  ));
  const refLines = markers.map((m, i) => (
    <ReferenceLine
      key={`m${i}`}
      yAxisId="left"
      x={m.at}
      stroke={MUTED}
      strokeDasharray="4 3"
      label={
        showMarkerLabels
          ? { value: m.label, position: "insideTopRight", fill: MUTED, fontFamily: MONO, fontSize: 11 }
          : undefined
      }
    />
  ));
  const grid = <CartesianGrid stroke={EDGE} vertical={false} />;
  const legend = showLegend ? (
    <Legend
      wrapperStyle={{ fontFamily: MONO, fontSize: 11 }}
      formatter={(value) => <span style={{ color: MUTED }}>{value}</span>}
    />
  ) : null;
  const margin = { top: 8, right: 8, bottom: 0, left: 0 };

  const series = indexes.map((i) => {
    const s = spec.series[i];
    const common = { yAxisId: axisOf(i), name: s.name, isAnimationActive: false } as const;
    const color = colorVar(s.color);
    if (spec.type === "bar") {
      return <Bar key={s.name} {...common} dataKey={`s${i}`} fill={color} radius={[4, 4, 0, 0]} />;
    }
    if (spec.type === "area") {
      return (
        <Area key={s.name} {...common} dataKey={`s${i}`} type="monotone" stroke={color} strokeWidth={2} fill={color} fillOpacity={0.15} />
      );
    }
    return <Line key={s.name} {...common} dataKey={`s${i}`} type="monotone" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--background)", strokeWidth: 2 }} />;
  });

  let chart: ReactElement;
  if (spec.type === "pie") {
    const s = spec.series[0];
    const slices = spec.rows
      .map((r) => ({ name: r.x, value: r.values[0] }))
      .filter((r): r is { name: string; value: number } => typeof r.value === "number");
    chart = (
      <PieChart>
        <Pie data={slices} dataKey="value" nameKey="name" stroke="var(--background)" strokeWidth={2} isAnimationActive={false}>
          {slices.map((_, i) => (
            <Cell key={i} fill={colorVar(PALETTE[i % PALETTE.length])} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: "var(--background)", border: `1px solid ${EDGE}`, borderRadius: 4, fontFamily: MONO, fontSize: 12 }}
          itemStyle={{ color: INK }}
          formatter={(v) => (typeof v === "number" ? withUnit(v, s.unit) : String(v ?? ""))}
        />
        {legend}
      </PieChart>
    );
  } else if (spec.type === "scatter") {
    chart = (
      <ScatterChart margin={margin}>
        {grid}
        {xAxis}
        {yAxes}
        {tooltip}
        {legend}
        {refLines}
        {indexes.map((i) => (
          <Scatter
            dataKey="y"
            key={spec.series[i].name}
            name={spec.series[i].name}
            yAxisId={axisOf(i)}
            fill={colorVar(spec.series[i].color)}
            isAnimationActive={false}
            data={rows.filter((r) => typeof r[`s${i}`] === "number").map((r) => ({ x: r.x, y: r[`s${i}`] }))}
          />
        ))}
      </ScatterChart>
    );
  } else {
    const Chart = spec.type === "bar" ? BarChart : spec.type === "area" ? AreaChart : LineChart;
    chart = (
      <Chart data={rows} margin={margin} syncId={syncId}>
        {grid}
        {xAxis}
        {yAxes}
        {tooltip}
        {legend}
        {refLines}
        {series}
      </Chart>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      {chart}
    </ResponsiveContainer>
  );
}

export default function ChartView({ spec }: { spec: ChartSpec }) {
  // Recharts syncs tooltips globally by syncId, so each chart instance needs its own.
  const syncId = useId();
  const rows = toRechartsRows(spec);
  const all = spec.series.map((_, i) => i);

  if (spec.layout === "stacked" && spec.type !== "pie") {
    // Fixed line heights and gaps (no collapsing margins), so the total matches
    // chartHeight() and the space the page reserved before this mounted.
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: PANEL_GAP }}>
        {all.map((i) => (
          <div key={spec.series[i].name}>
            <div
              style={{
                color: MUTED,
                fontFamily: MONO,
                fontSize: 11,
                lineHeight: `${PANEL_LABEL_HEIGHT}px`,
                marginBottom: PANEL_LABEL_GAP,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {spec.series[i].name}
            </div>
            <Panel
              spec={spec}
              rows={rows}
              indexes={[i]}
              height={PANEL_HEIGHT}
              syncId={syncId}
              showLegend={false}
              showMarkerLabels={i === 0}
              showXLabel={i === all.length - 1}
            />
          </div>
        ))}
      </div>
    );
  }
  return (
    <Panel
      spec={spec}
      rows={rows}
      indexes={all}
      height={spec.type === "pie" ? PIE_HEIGHT : CHART_HEIGHT}
      showLegend={spec.series.length > 1 || spec.type === "pie"}
      showMarkerLabels
      showXLabel
    />
  );
}
