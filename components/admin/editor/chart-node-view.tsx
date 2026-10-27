"use client";

// The rich editor's code blocks. Ordinary blocks render exactly as TipTap's
// default (pre > code, editable text); ```chart blocks render as the chart
// itself, a non-editable block with an Edit button. The document still holds
// the block's source text, so the saved Markdown never changes.
import type { NodeViewRenderer } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { lazy, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { parseChart } from "@/lib/charts/spec";
import { buttonQuiet } from "../ui";

// Recharts loads only once a chart block shows up.
const ChartView = lazy(() => import("@/components/charts/ChartView"));

const isChart = (node: PMNode) => node.attrs.language === "chart";

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
          <Suspense fallback={null}>
            <ChartView spec={result.spec} />
          </Suspense>
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

/** Code blocks for the browser editor; `onEdit` opens the chart dialog for the block at `pos`. */
export function chartNodeView(onEdit: (pos: number, source: string) => void): NodeViewRenderer {
  return ({ node, getPos, HTMLAttributes, editor }) => {
    if (!isChart(node)) {
      const pre = document.createElement("pre");
      for (const [key, value] of Object.entries(HTMLAttributes)) {
        if (value != null) pre.setAttribute(key, String(value));
      }
      const code = document.createElement("code");
      const setLanguage = (n: PMNode) => {
        code.className = n.attrs.language ? `language-${n.attrs.language}` : "";
      };
      setLanguage(node);
      pre.appendChild(code);
      return {
        dom: pre,
        contentDOM: code,
        update(next) {
          if (next.type !== node.type || isChart(next)) return false;
          setLanguage(next);
          return true;
        },
      };
    }

    let current = node;
    const dom = document.createElement("div");
    dom.contentEditable = "false";
    dom.setAttribute("data-chart-block", "");
    const root: Root = createRoot(dom);
    const edit = () => {
      const pos = getPos();
      if (editor.isEditable && typeof pos === "number") onEdit(pos, current.textContent);
    };
    const render = () => root.render(<ChartBlock source={current.textContent} onEdit={edit} />);
    render();

    return {
      dom,
      update(next) {
        if (next.type !== current.type || !isChart(next)) return false;
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
