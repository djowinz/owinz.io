"use client";

// Article HTML from the Markdown renderer, plus chart hydration: each
// `figure.chart[data-chart]` placeholder gets an interactive ChartView mounted
// into it. Recharts is dynamic-imported, so pages without charts never load it.
import { useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ChartSpec } from "@/lib/charts/spec";

export default function ArticleHtml({ html, className }: { html: string; className: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const figures = Array.from(host.querySelectorAll<HTMLElement>("figure.chart[data-chart]"));
    if (!figures.length) return;

    let cancelled = false;
    const roots: Root[] = [];
    import("./charts/ChartView").then(({ default: ChartView }) => {
      if (cancelled) return;
      for (const figure of figures) {
        let spec: ChartSpec;
        try {
          spec = JSON.parse(figure.dataset.chart ?? "");
        } catch {
          continue; // leave the fallback table visible
        }
        const mount = document.createElement("div");
        mount.setAttribute("aria-hidden", "true"); // the data table carries the content
        figure.appendChild(mount);
        const root = createRoot(mount);
        root.render(<ChartView spec={spec} />);
        roots.push(root);
        figure.setAttribute("data-hydrated", "");
      }
    });

    return () => {
      cancelled = true;
      // Unmounting a root during React's own commit warns; defer it.
      queueMicrotask(() => roots.forEach((r) => r.unmount()));
    };
  }, [html]);

  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
