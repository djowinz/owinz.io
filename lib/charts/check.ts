// Publish checks for chart blocks: parse errors block, the rest advise.
import { chartSources, parseChart } from "./spec";

const MAX_PIE_SLICES = 8;
const SLOW_ROWS = 2000;

export function chartIssues(markdown: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  chartSources(markdown).forEach((source, i) => {
    const result = parseChart(source);
    const title = result.ok ? result.spec.title?.trim() : undefined;
    const name = title ? `Chart "${title}": ` : `Chart ${i + 1}: `;
    if (!result.ok) {
      for (const message of result.errors) errors.push(name + message);
      return;
    }
    const { spec } = result;
    for (const message of result.warnings) warnings.push(name + message);
    if (spec.type === "pie") {
      if (spec.rows.some((row) => (row.values[0] ?? 0) < 0)) warnings.push(`${name}pie slices can't be negative`);
      if (spec.rows.length > MAX_PIE_SLICES) warnings.push(`${name}pies read best with ${MAX_PIE_SLICES} slices or fewer`);
    }
    if (spec.rows.length > SLOW_ROWS) warnings.push(`${name}${spec.rows.length} rows may be slow to draw`);
    if (!title && !spec.caption?.trim()) warnings.push(`${name}add a title or caption so readers know what it shows`);
  });
  return { errors, warnings };
}
