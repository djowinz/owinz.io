"use client";

// Article HTML from the Markdown renderer, plus chart hydration: each
// `figure.chart[data-chart]` placeholder gets an interactive ChartView mounted
// into it. Recharts is dynamic-imported, so pages without charts never load it.
// Until a chart mounts, CSS (app/globals.css) hides the fallback table and
// reserves the chart's height, so the page doesn't jump.
import { useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { ChartBoundary } from "./charts/ChartBoundary";
import type { ChartSpec } from "@/lib/charts/spec";

type ChartViewModule = typeof import("./charts/ChartView");

// Loaded once per page. After that, charts mount in the same commit as new
// HTML (the editor preview re-renders on every typing pause) and never flicker.
let chartView: ChartViewModule | null = null;
let loading: Promise<ChartViewModule> | null = null;
const loadChartView = () => (loading ??= import("./charts/ChartView").then((m) => (chartView = m)));

export default function ArticleHtml({ html, className }: { html: string; className: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    const figures = Array.from(host.querySelectorAll<HTMLElement>("figure.chart[data-chart]"));
    if (!figures.length) return;

    let cancelled = false;
    const mounted: { mount: HTMLElement; root: Root }[] = [];
    // Shows the fallback table again (and the boundary's note) when a chart can't draw.
    const fail = (figure: HTMLElement, mount?: HTMLElement) => {
      figure.removeAttribute("data-hydrated");
      figure.setAttribute("data-chart-failed", "");
      mount?.removeAttribute("aria-hidden");
    };

    const mountAll = ({ default: ChartView }: ChartViewModule, sync: boolean) => {
      for (const figure of figures) {
        let spec: ChartSpec;
        try {
          spec = JSON.parse(figure.dataset.chart ?? "");
        } catch {
          fail(figure);
          continue;
        }
        const mount = document.createElement("div");
        mount.setAttribute("aria-hidden", "true"); // the data table carries the content
        figure.appendChild(mount);
        const root = createRoot(mount);
        const chart = (
          <ChartBoundary onError={() => fail(figure, mount)}>
            <ChartView spec={spec} />
          </ChartBoundary>
        );
        // From the layout effect this commits before the browser paints. After
        // the first import it would land a frame after data-hydrated drops the
        // reserved height, so render it synchronously.
        if (sync) flushSync(() => root.render(chart));
        else root.render(chart);
        mounted.push({ mount, root });
        figure.setAttribute("data-hydrated", "");
      }
    };

    if (chartView) mountAll(chartView, false);
    else {
      loadChartView().then(
        (m) => !cancelled && mountAll(m, true),
        () => !cancelled && figures.forEach((f) => fail(f)),
      );
    }

    return () => {
      cancelled = true;
      // Leave the figures as the server sent them, so a re-run (HMR, Strict
      // Mode) on the same DOM mounts each chart once.
      for (const { mount } of mounted) mount.remove();
      for (const figure of figures) {
        figure.removeAttribute("data-hydrated");
        figure.removeAttribute("data-chart-failed");
      }
      // Unmounting a root during React's own commit warns; defer it.
      const roots = mounted.map((m) => m.root);
      queueMicrotask(() => roots.forEach((r) => r.unmount()));
    };
  }, [html]);

  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
