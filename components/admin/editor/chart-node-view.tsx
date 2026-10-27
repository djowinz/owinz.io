"use client";

// The rich editor's ```chart blocks (the `chart` atom node in
// lib/cms/editor-schema.ts) render as the chart itself, with an Edit button.
// The node keeps the block's source untouched, so the saved Markdown never
// changes. Ordinary code blocks keep TipTap's default rendering.
import type { NodeViewRenderer } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { lazy, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChartBoundary } from "@/components/charts/ChartBoundary";
import { chartHeight } from "@/lib/charts/layout";
import { parseChart } from "@/lib/charts/spec";
import { buttonQuiet } from "../ui";

// Recharts loads only once a chart block shows up.
const ChartView = lazy(() => import("@/components/charts/ChartView"));

const sourceOf = (node: PMNode) => String(node.attrs.source ?? "");

function ChartBlock({ source, onEdit }: { source: string; onEdit(): void }) {
  const result = parseChart(source);
  return (
    <figure className={result.ok ? "chart" : "chart chart-error"}>
      {result.ok ? (
        <>
          {(result.spec.title || result.spec.caption) && (
            <figcaption>
              {result.spec.title && <span className="chart-title">{result.spec.title}</span>}
              {result.spec.caption && <span className="chart-caption">{result.spec.caption}</span>}
            </figcaption>
          )}
          <ChartBoundary resetKey={source}>
            <Suspense fallback={<div style={{ height: chartHeight(result.spec) }} />}>
              <ChartView spec={result.spec} />
            </Suspense>
          </ChartBoundary>
        </>
      ) : (
        <>
          <p>Chart couldn&apos;t be drawn: {result.errors[0]}</p>
          <pre>
            <code>{source}</code>
          </pre>
        </>
      )}
      <div className="mt-2 flex items-center gap-3">
        <button type="button" className={buttonQuiet} disabled={!result.ok} onClick={onEdit}>
          Edit
        </button>
        {!result.ok && <span className="text-xs text-muted">Fix this chart in Markdown mode</span>}
      </div>
    </figure>
  );
}

/** Chart blocks for the browser editor; `onEdit` opens the chart dialog for the block at `pos`. */
export function chartNodeView(onEdit: (pos: number, source: string) => void): NodeViewRenderer {
  return ({ node, getPos, editor }) => {
    let current = node;
    const dom = document.createElement("div");
    dom.contentEditable = "false";
    dom.setAttribute("data-chart-block", "");
    const root: Root = createRoot(dom);
    const edit = () => {
      const pos = getPos();
      if (editor.isEditable && typeof pos === "number") onEdit(pos, sourceOf(current));
    };
    const render = () => root.render(<ChartBlock source={sourceOf(current)} onEdit={edit} />);
    render();

    return {
      dom,
      update(next) {
        if (next.type !== current.type) return false;
        current = next;
        render();
        return true;
      },
      // The chart draws itself (tooltips, resizes); none of that is document content.
      ignoreMutation: () => true,
      // Let the Edit button take its own clicks instead of ProseMirror.
      stopEvent: (event) => event.target instanceof Element && event.target.closest("button") !== null,
      destroy() {
        // Unmounting a root during React's own commit warns; defer it.
        queueMicrotask(() => root.unmount());
      },
    };
  };
}
