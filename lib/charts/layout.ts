// The heights ChartView draws at, shared with the renderer so the page can
// reserve a chart's space (app/globals.css) before Recharts loads.
import type { ChartSpec } from "./spec";

export const CHART_HEIGHT = 280;
export const PIE_HEIGHT = 320;
/** Stacked layout: one panel per series, each a name line over a small chart. */
export const PANEL_HEIGHT = 160;
export const PANEL_LABEL_HEIGHT = 16;
export const PANEL_LABEL_GAP = 4;
export const PANEL_GAP = 8;

/** Chart panels ChartView draws: one per series when stacked (pies never stack). */
export function panelCount(spec: ChartSpec): number {
  return spec.layout === "stacked" && spec.type !== "pie" ? spec.series.length : 1;
}

/** The pixel height of ChartView for this spec. */
export function chartHeight(spec: ChartSpec): number {
  if (spec.type === "pie") return PIE_HEIGHT;
  if (spec.layout !== "stacked") return CHART_HEIGHT;
  const n = panelCount(spec);
  return n * (PANEL_LABEL_HEIGHT + PANEL_LABEL_GAP + PANEL_HEIGHT) + Math.max(0, n - 1) * PANEL_GAP;
}
