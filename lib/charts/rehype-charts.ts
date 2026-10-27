// Rehype plugin for ```chart blocks: each becomes a placeholder <figure> that
// the client hydrates with Recharts. It carries the spec in `data-chart` and a
// plain data table as the no-JS fallback. An invalid block shows the first
// error plus its source; the renderer never throws.
import type { Element, ElementContent, Root } from "hast";
import { SKIP, visit } from "unist-util-visit";
import { parseChart, type ChartSpec } from "./spec";

function element(
  tagName: string,
  children: ElementContent[] = [],
  properties: Element["properties"] = {},
): Element {
  return { type: "element", tagName, properties, children };
}

const text = (value: string): ElementContent => ({ type: "text", value });
const cell = (tagName: "th" | "td", value: string) => element(tagName, [text(value)]);

function textOf(node: ElementContent): string {
  if (node.type === "text") return node.value;
  return node.type === "element" ? node.children.map(textOf).join("") : "";
}

function isChartBlock(node: Element): boolean {
  const code = node.children[0];
  if (node.tagName !== "pre" || code?.type !== "element" || code.tagName !== "code") return false;
  const classes = code.properties.className;
  return Array.isArray(classes) && classes.includes("language-chart");
}

function dataFigure(spec: ChartSpec): Element {
  const labels = spec.series.map((s) => (s.unit ? `${s.name} (${s.unit})` : s.name));
  const caption: ElementContent[] = [];
  if (spec.title) caption.push(element("span", [text(spec.title)], { className: ["chart-title"] }));
  if (spec.caption) caption.push(element("span", [text(spec.caption)], { className: ["chart-caption"] }));

  const table = element(
    "table",
    [
      element("thead", [element("tr", [cell("th", spec.x.name), ...labels.map((l) => cell("th", l))])]),
      element(
        "tbody",
        spec.rows.map((row) =>
          element("tr", [
            cell("td", row.x),
            ...row.values.map((v) => cell("td", v === null ? "" : String(v))),
          ]),
        ),
      ),
    ],
    { className: ["chart-data"] },
  );

  return element("figure", [...(caption.length ? [element("figcaption", caption)] : []), table], {
    className: ["chart"],
    // Escape the "<" so the attribute holds no raw tag text (still the same JSON).
    dataChart: JSON.stringify(spec).replace(/</g, "\\u003c"),
  });
}

function errorFigure(message: string, source: string): Element {
  return element(
    "figure",
    [
      element("p", [text(`Chart couldn't be drawn: ${message}`)]),
      element("pre", [element("code", [text(source)])]),
    ],
    { className: ["chart", "chart-error"] },
  );
}

export function rehypeCharts() {
  return (tree: Root) => {
    visit(tree, "element", (node, index, parent) => {
      if (!parent || index === undefined || !isChartBlock(node)) return;
      const source = textOf(node.children[0]).replace(/\n$/, "");
      const result = parseChart(source);
      parent.children[index] = result.ok ? dataFigure(result.spec) : errorFigure(result.errors[0], source);
      return SKIP;
    });
  };
}
