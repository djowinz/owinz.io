# Inline Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Writers paste spreadsheet data into a full-screen dialog and get an interactive, theme-matched Recharts chart in a post. The chart is stored as a plain ` ```chart ` Markdown block and renders identically in the editor, the site preview, and the live page.

**Architecture:**
- A pure module (`lib/charts/`) parses and serializes the chart block.
- A rehype plugin in `markdownToHtml` turns each block into a `<figure class="chart" data-chart>` placeholder with a fallback data table.
- A client component (`ArticleHtml`) replaces the four `dangerouslySetInnerHTML` sites and mounts `ChartView` (Recharts) into each placeholder.
- In TipTap, chart blocks stay ordinary code blocks with `language: "chart"`. A vanilla ProseMirror node view renders them as the chart plus an Edit button. A toolbar button opens `ChartDialog`.

**Tech Stack:** Next 16.4 / React 19.2, TipTap 3.32 (`@tiptap/markdown`), unified/rehype, Recharts 2.15.0 (already a dependency), js-yaml 4.1.1, Vitest, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-26-inline-charts-design.md`. Read it before starting any task.

## Global Constraints

- Markdown stays the source of truth. Opening and saving a post must never change a chart block: the TipTap round-trip must be byte-identical.
- One schema/parser (`lib/charts/spec.ts`) is shared by the dialog, renderer, publish checks, and tests. It is pure, with no React.
- Chart types are `line | bar | area | scatter | pie`. Layouts are `single | stacked | dual`, with `dual` only for exactly 2 series.
- Colors are referenced by palette name only, rendered as `var(--chart-<name>)`. No hex values in stored blocks.
- Palette names (fixed, in order): `violet, rust, teal, gold, blue, magenta, olive, slate`. `violet` equals `--accent` (`#7c3aed` light / `#b69bff` dark). Each color must have ≥ 3:1 contrast against `--background` (`#f8f7f4` light, `#141311` dark).
- The renderer never throws. An invalid block renders a visible "Chart couldn't be drawn: <first error>" note plus the raw block.
- Recharts loads only on pages that contain a chart (dynamic import).
- The editor addition is one isolated node view. Other code blocks behave exactly as today.
- Read `node_modules/next/dist/docs/` before writing Next-specific code (AGENTS.md). Match surrounding style: comment density, `cn`, `components/admin/ui.tsx` primitives.
- Run `pnpm test` and `pnpm lint` green at the end of every task.

## Review Focus

1. **Pasted numbers with formatting** (`1,234`, `45%`, `$12`, ` 3.0 `) parse as numbers. Only text that is not a number is an error. Test in Task 2.
2. **Empty cells** in a series become gaps (`null`), not zeros and not errors. A wholly empty series is an error. Test in Task 2.
3. **Labels containing HTML or quotes** (`<script>`, `"`, `&`) in titles, column names, or markers are escaped in the placeholder, the fallback table, and the `data-chart` JSON. Test in Task 4.
4. **The preview column re-rendering while typing** must not leak React roots or throw "synchronously unmount a root while rendering" warnings. Unmount roots in a microtask. Test in Task 5.
5. **A hand-written chart block with blank lines inside** must not leak CSV into the meta description (`summarize`). Test in Task 4.

---

### Task 1: Round-trip gate

**Files:**
- Modify: `tests/editor-roundtrip.test.ts`

**Interfaces:** none produced. This task only proves the storage assumption.

- [ ] **Step 1: Add the failing-or-passing tests.** Add two cases to the `describe` block, using the file's existing `roundTrip` helper:

```ts
const CHART = "```chart\ntype: line\nlayout: stacked\ntitle: \"Faster to ship: slower to fix\"\nseries:\n  MTTR (hours): { color: rust, unit: h }\nmarkers:\n  - x: 2026-06-08\n    label: AI rollout\n---\nweek,Lead time (days),MTTR (hours)\n2026-04-27,4.3,3.0\n2026-05-04,,3.1\n```";
it("keeps chart blocks byte-for-byte", () => {
  expect(roundTrip(CHART).trim()).toBe(CHART);
  expect(roundTrip(`Before\n\n${CHART}\n\nAfter`)).toContain(CHART);
});
it("keeps a chart block with a blank line inside", () => {
  const md = "```chart\ntype: bar\n---\nq,v\n\nQ1,1\n```";
  expect(roundTrip(md).trim()).toBe(md);
});
```

- [ ] **Step 2: Run** `pnpm vitest run tests/editor-roundtrip.test.ts`. Expected: PASS. **If either case fails, stop and report the diff to the controller.** The spec says to revisit the design rather than work around it.
- [ ] **Step 3: Commit:** `test(editor): chart code blocks round-trip unchanged`

---

### Task 2: Pasted-table parsing and inference

**Files:**
- Create: `lib/charts/table.ts`
- Test: `tests/charts-table.test.ts`

**Interfaces:**
- Produces:
  - `parseTable(text: string): { ok: true; columns: string[]; rows: string[][] } | { ok: false; errors: string[] }`. Detects TSV when the first line has a tab, otherwise CSV with RFC-4180 quoting. Trims cells and drops fully blank lines. Requires a header plus ≥ 2 rows and ≥ 2 columns. Ragged rows are an error naming the row number.
  - `parseNumber(cell: string): number | null | undefined`. `""` → `null` (gap); a number after stripping whitespace, `,`, `$`, `%` → number; otherwise `undefined` (not a number).
  - `type XKind = "time" | "number" | "category"`
  - `xKindOf(values: string[]): XKind`. Every value is `YYYY-MM-DD` or `YYYY-MM` → `"time"`; every value is a number → `"number"`; otherwise `"category"`.
  - `suggestType(xKind: XKind, seriesCount: number, rowCount: number): { type: ChartType; reason: string }`. `time` or `number` → line ("line, because x is dates" / "…numbers"). `category` → bar ("bar, because x is categories"). Never suggests pie.
  - `toCsv(columns: string[], rows: string[][]): string`. Quotes cells containing `,`, `"`, or a newline.
  - `ChartType` is imported from `lib/charts/spec.ts` (Task 3). Define `export type ChartType = "line" | "bar" | "area" | "scatter" | "pie"` in `spec.ts` first, as a stub, so this task compiles.

- [ ] **Step 1: Write failing tests** in `tests/charts-table.test.ts`:
  - `parseTable("week\tA\tB\n2026-04-27\t4.3\t3.0\n2026-05-04\t4.2\t3.1")` returns columns `["week","A","B"]` and 2 rows.
  - CSV with a quoted cell `"1,234"` keeps it as one cell.
  - `parseTable("a,b\n1,2")` is an error (one row). A ragged row 3 gives an error containing `"row 3"`.
  - `parseNumber`: `"1,234"`→1234, `"45%"`→45, `"$12"`→12, `" 3.0 "`→3, `""`→null, `"n/a"`→undefined.
  - `xKindOf(["2026-04","2026-05"])`→`"time"`, `["1","2.5"]`→`"number"`, `["Q1","Q2"]`→`"category"`.
  - `suggestType("time",2,26)` → `{ type:"line", reason:"line, because x is dates" }`. `suggestType("category",1,5).type`→`"bar"`.
  - `toCsv(["a","b"],[["x,y","2"]])` → `'a,b\n"x,y",2'`.
- [ ] **Step 2: Run** `pnpm vitest run tests/charts-table.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `lib/charts/table.ts`, plus the `ChartType` stub in `lib/charts/spec.ts`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(charts): parse pasted spreadsheet tables`

---

### Task 3: Chart spec parse / serialize, and palette names

**Files:**
- Create: `lib/charts/spec.ts`, `lib/charts/palette.ts`
- Modify: `package.json` (add `js-yaml@4.1.1` and `@types/js-yaml` as direct dependencies; both are already in the lockfile transitively)
- Test: `tests/charts-spec.test.ts`

**Interfaces:**
- Consumes: `parseTable`, `parseNumber`, `xKindOf`, `toCsv` (Task 2).
- Produces (`lib/charts/palette.ts`):
  - `export const PALETTE = ["violet","rust","teal","gold","blue","magenta","olive","slate"] as const; export type PaletteName = (typeof PALETTE)[number];`
  - `colorVar(name: PaletteName): string`, which returns `var(--chart-<name>)`.
- Produces (`lib/charts/spec.ts`):

```ts
export type ChartType = "line" | "bar" | "area" | "scatter" | "pie";
export type Layout = "single" | "stacked" | "dual";
export interface SeriesSpec { name: string; color: PaletteName; axis: "left" | "right"; unit?: string }
export interface Marker { x: string; label: string }
export interface ChartSpec {
  type: ChartType; layout: Layout; title?: string; caption?: string;
  x: { name: string; label?: string; kind: XKind };
  series: SeriesSpec[];
  markers: Marker[];
  rows: { x: string; values: (number | null)[] }[]; // values[i] belongs to series[i]
}
export type ParseResult = { ok: true; spec: ChartSpec; warnings: string[] } | { ok: false; errors: string[] };
export function parseChart(source: string): ParseResult;   // source = text inside the fence
export function serializeChart(spec: ChartSpec): string;   // canonical text inside the fence
export const CHART_FENCE: RegExp;                           // /^```chart[^\n]*\n([\s\S]*?)\n```[ \t]*$/gm
export function chartSources(markdown: string): string[];   // inner text of every chart fence
```

- `parseChart` rules (from the spec):
  - Split on the first line that is exactly `---`. The header is YAML (`js-yaml` `load`, `JSON_SCHEMA` so dates stay strings), the rest goes to `parseTable`.
  - `type` is required and must be a valid `ChartType`. `layout` defaults to `single`. `dual` requires exactly 2 series.
  - The first column is X. `series` keys must name existing columns, otherwise error `series "<k>" isn't a column`.
  - Colors default to palette order by column index. An unknown color is an error.
  - `axis: right` defaults to `left`, and is the default for the 2nd series when `layout: dual` and no axis is given.
  - Every non-empty cell in a series must be a number (`parseNumber !== undefined`), otherwise error `"<cell>" in <series> isn't a number (row N)`. An all-null series is an error.
  - Markers on a `category` X must exactly match a row's X: `marker "<label>" doesn't match any row`. On `time`, a marker `x` must itself be a date.
  - Markers on `pie` are an error.
  - Unknown top-level keys become a warning: `unknown setting "<k>"`.
- `serializeChart`:
  - Key order: `type, layout, title, caption, x, series, markers`.
  - Omit defaults: `layout: single`, palette-order colors, `axis: left`, empty markers.
  - Print `series`/`x` entries in YAML flow style (`{ color: rust, unit: h }`). Quote strings only when YAML requires it.
  - Then `---`, then `toCsv` of the X column plus series columns, with `null` written as an empty cell.

- [ ] **Step 1: Write failing tests:**
  - Parse the spec document's example block. Expect `layout:"stacked"`, `x.kind:"time"`, 2 series with `unit` `d`/`h`, `rows.length === 2`, and `markers[0].label === "AI rollout"`.
  - Each error rule above produces its message (one `it` per rule).
  - Unknown key → `ok: true` with the warning.
  - Round-trip stability: `serializeChart(parseChart(s).spec)` reparsed deep-equals the first parse. Run this for the example block, a bar/category chart, and a dual chart.
  - Canonical output: `serializeChart` of a parsed block with `layout: single` and default colors contains neither `layout:` nor `color:`.
  - `chartSources("a\n\n```chart\ntype: bar\n---\nq,v\nQ1,1\nQ2,2\n```\n\n```ts\nx\n```")` has length 1.
- [ ] **Step 2: Run** `pnpm vitest run tests/charts-spec.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `palette.ts` and `spec.ts`, then `pnpm add js-yaml@4.1.1 && pnpm add -D @types/js-yaml`.
- [ ] **Step 4: Run** the same command plus `pnpm vitest run tests/charts-table.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(charts): chart block schema, parser, and canonical serializer`

---

### Task 4: Render chart blocks in the site's Markdown pipeline

**Files:**
- Create: `lib/charts/rehype-charts.ts`
- Modify: `lib/content/render.ts` (`markdownToHtml`: add `.use(rehypeCharts)` after `remarkRehype` and **before** `rehypeHighlight`), `lib/seo.ts` (`summarize`: remove fenced code blocks before splitting paragraphs)
- Test: `tests/charts-render.test.ts`, extend `tests/seo.test.ts`

**Interfaces:**
- Consumes: `parseChart`, `ChartSpec` (Task 3).
- Produces:
  - `rehypeCharts(): (tree: Root) => void`, a unified plugin.
  - Placeholder HTML contract, which Task 5 relies on:
    - Valid block: `<figure class="chart" data-chart="<JSON.stringify(spec)>">`, containing:
      - `<figcaption>` with `<span class="chart-title">` and/or `<span class="chart-caption">`, omitted when both are empty
      - `<table class="chart-data">` with a `<thead>` (X name + series names, with ` (unit)` appended when set) and a `<tbody>` (empty string for null)
    - Invalid block: `<figure class="chart chart-error"><p>Chart couldn't be drawn: <first error></p><pre><code>…raw…</code></pre></figure>`
  - Build the output as hast nodes (not string concatenation), so `hast-util-to-html` escapes it.

- [ ] **Step 1: Write failing tests** (`markdownToHtml` end to end):
  - The example block yields one `figure.chart`. Its `data-chart` attribute, once HTML-unescaped and parsed with `JSON.parse`, deep-equals `parseChart(...).spec`. It contains a `table.chart-data` with 2 body rows. The output contains no `hljs` class inside the figure.
  - A block with `type: donut` yields `chart-error` and the text `Chart couldn't be drawn:`.
  - Escaping: `title: "<script>alert(1)</script> & \"q\""` produces no `<script>` in the output, and the title appears escaped in the figcaption.
  - Normal ` ```ts ` blocks are still highlighted (contain `hljs`).
  - `seo.test.ts`: `summarize("```chart\ntype: bar\n\n---\nq,v\nQ1,1\n```\n\nReal opening paragraph.")` returns `"Real opening paragraph."`.
- [ ] **Step 2: Run** `pnpm vitest run tests/charts-render.test.ts tests/seo.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the plugin. Match `pre > code.language-chart` and take its text content. Wire it into `markdownToHtml`. Change `summarize` to strip ```` /```[\s\S]*?```/g ```` first.
- [ ] **Step 4: Run** the full `pnpm test`. Expected: PASS. The existing round-trip and content tests stay green.
- [ ] **Step 5: Commit:** `feat(charts): render chart blocks as placeholders with a data-table fallback`

---

### Task 5: Palette tokens, ChartView, and hydration everywhere article HTML appears

**Files:**
- Modify: `app/globals.css`. Add `--chart-<name>` for all 8 names in the light `:root` block and the dark block, and `figure.chart` styles: a min-height reserving space, the table visually hidden via an `sr-only` pattern once `[data-hydrated]` is set, and the `.chart-error` note style.
- Create: `lib/charts/recharts-data.ts` (pure), `components/charts/ChartView.tsx` (client), `components/ArticleHtml.tsx` (client)
- Modify: `components/ArticleView.tsx:127-130`, `app/(site)/projects/[slug]/page.tsx:190-193`, `components/admin/editor/PostEditor.tsx:593`, `components/admin/editor/ProjectEditor.tsx:736`. Replace each `<div className=… dangerouslySetInnerHTML>` with `<ArticleHtml className=… html=… />`.
- Test: `tests/charts-recharts-data.test.ts`

**Interfaces:**
- Consumes: `ChartSpec`, `colorVar`, `PALETTE` (Task 3), placeholder contract (Task 4).
- Produces:
  - `toRechartsRows(spec: ChartSpec): Record<string, number | string | null>[]`. Keys are `x` (a timestamp for `time`, a number for `number`, otherwise a string) plus `s0..sN`.
  - `markerX(spec: ChartSpec, marker: Marker): number | string`, converted the same way as `x`.
  - `ChartView({ spec }: { spec: ChartSpec }): JSX.Element`:
    - Wrapped in `ResponsiveContainer`.
    - Layouts: `single` puts all series in one chart; `dual` gives two `YAxis` with `yAxisId="left"|"right"` per `series.axis`; `stacked` gives one chart per series, sharing a `syncId`, each labeled with the series name.
    - Markers are `ReferenceLine` with a label. The X axis is `type="number" scale="time"` with month/day ticks for `time`.
    - Units are appended in ticks and the tooltip.
    - Strokes and fills use `colorVar(series.color)`. Axes, grid, and text use `var(--edge)`, `var(--muted)`, `var(--foreground)`, with Geist Mono ticks.
    - Pie charts use the first series, one slice per row, colored in palette order.
  - `ArticleHtml({ html, className }: { html: string; className: string }): JSX.Element`:
    - Renders `<div className={className} dangerouslySetInnerHTML={{ __html: html }} />`.
    - In a `useEffect` keyed on `html`, it finds `figure.chart[data-chart]`. If there are any, it dynamically imports `./charts/ChartView`, creates a child `<div>` in each figure, calls `createRoot(div).render(<ChartView spec={JSON.parse(...)} />)`, and sets `data-hydrated` on the figure.
    - Cleanup unmounts every root inside `queueMicrotask`.

- [ ] **Step 1: Pick the 6 non-accent hues** using the `dataviz` skill's palette method and run its validator. Record the light/dark hex pairs and the validator output in the commit message body. Every color must be ≥ 3:1 against its background, and adjacent colors must stay distinguishable under CVD simulation.
- [ ] **Step 2: Write failing tests** for `toRechartsRows`/`markerX`:
  - A time spec gives `x === Date.UTC(2026,3,27)` for `2026-04-27`, and `s1 === null` for an empty cell.
  - A category spec gives `x === "Q1"`.
  - `markerX` for `2026-06-08` gives `Date.UTC(2026,5,8)`.
- [ ] **Step 3: Run** `pnpm vitest run tests/charts-recharts-data.test.ts`. Expected: FAIL. **Step 4:** Implement `recharts-data.ts`. Run again. Expected: PASS.
- [ ] **Step 5: Implement** `ChartView`, `ArticleHtml`, the CSS, and the four call-site swaps. Check `node_modules/next/dist/docs/` on client components inside `cacheComponents` pages before editing `ArticleView` and the project page.
- [ ] **Step 6: Verify in the running app.**
  - `pnpm dev`. Create a draft whose body is the spec example block. Open the editor's Site preview: a stacked SVG chart renders, and hovering shows the values with units.
  - Type in the body 10 times. There are no console errors or warnings about unmounting roots (Review Focus 4).
  - Toggle dark mode: the colors switch.
  - Check that an article without a chart doesn't request a Recharts chunk (Network tab).
  - Take light and dark screenshots for the reviewer.
- [ ] **Step 7: Run** `pnpm test && pnpm lint`. Expected: PASS. **Commit:** `feat(charts): interactive Recharts charts on the site and in previews`

---

### Task 6: Publish checks for chart blocks

**Files:**
- Create: `lib/charts/check.ts`
- Modify: `lib/cms/validate.ts` (`checkPostForPublish`), `lib/cms/validate-project.ts` (`checkProjectForPublish`)
- Test: `tests/charts-check.test.ts`

**Interfaces:**
- Consumes: `chartSources`, `parseChart` (Task 3).
- Produces: `chartIssues(markdown: string): { errors: string[]; warnings: string[] }`. Each message is prefixed with the chart's name: `Chart "<title>": ` or `Chart <N>: ` (1-based).
  - Errors: all `parseChart` errors.
  - Warnings: `parseChart` warnings, plus the following:
    - pie with a negative value: `pie slices can't be negative`
    - pie with more than 8 rows: `pies read best with 8 slices or fewer`
    - more than 2,000 rows: `<n> rows may be slow to draw`
    - no title and no caption: `add a title or caption so readers know what it shows`
- Both validators push these into the result with `field: "body"`.

- [ ] **Step 1: Write failing tests:**
  - A post body with one valid titled chart and one `type: donut` chart yields exactly one error starting `Chart 2:`.
  - The untitled-chart warning text.
  - The pie warnings.
  - `checkPostForPublish` with that body includes the error. Build a minimal valid `PostInput` the way `tests/cms-posts.test.ts` does.
  - `checkProjectForPublish` also includes it.
- [ ] **Step 2: Run** `pnpm vitest run tests/charts-check.test.ts`. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(charts): publish checks for chart blocks`

---

### Task 7: Chart node view in the TipTap editor

**Files:**
- Create: `components/admin/editor/chart-node-view.tsx`
- Modify: `lib/cms/editor-schema.ts`, `components/admin/editor/RichEditor.tsx`, `package.json` (add `@tiptap/extension-code-block@^3.32.0` as a direct dependency; it's already in the lockfile)
- Test: `tests/editor-roundtrip.test.ts` (must remain green), `tests/editor-chart.test.ts`

**Interfaces:**
- Consumes: `parseChart`, `ChartSpec` (Task 3), `ChartView` (Task 5).
- Produces:
  - `EditorSchemaOptions` gains `codeBlockView?: NodeViewRenderer`. `editorExtensions()` configures `StarterKit` with `codeBlock: false` and adds `CodeBlock.extend({ addNodeView: options.codeBlockView ? () => options.codeBlockView! : undefined })`. Without the option, behavior and Markdown output are exactly as today, so the tests use no node view.
  - `chartNodeView(onEdit: (pos: number, source: string) => void): NodeViewRenderer`, a vanilla ProseMirror node view:
    - Non-chart code blocks return `{ dom: pre, contentDOM: code }`, with `code.className = "language-<lang>"` when a language is set. This matches the default render.
    - Chart blocks return a non-editable `dom` (`contenteditable=false`) with no `contentDOM`. It mounts a React root showing `ChartView`, or the error note (with Edit disabled and the text "Fix this chart in Markdown mode"), plus an Edit button calling `onEdit(getPos(), node.textContent)`.
    - `update(node)` returns `false` when `language` changes between chart and non-chart, otherwise re-renders.
    - `ignoreMutation: () => true` for charts.
    - `destroy` unmounts the root in a microtask.
  - `BodyEditorHandle` gains `insertChart(source: string): void` (at the current selection) and `replaceChart(pos: number, source: string): void`. Both insert `{ type: "codeBlock", attrs: { language: "chart" }, content: [{ type: "text", text: source }] }`; replace swaps the node at `pos`.
  - `RichEditor` `Props` gains `onEditChart?(pos: number, source: string): void` and `onAddChart?(): void`. The toolbar gets a `Chart` tool right after `{ }` that calls `onAddChart`.

- [ ] **Step 1: Write a failing test** `tests/editor-chart.test.ts`. Build a headless `Editor` from `@tiptap/core` with `editorExtensions()` and `Markdown`. Run `insertContent` of the chart node JSON above into an empty doc, then call `getMarkdown()`. It must equal `` "```chart\n" + source + "\n```" ``. This is the exact content `insertChart` will insert.
- [ ] **Step 2: Run** `pnpm vitest run tests/editor-chart.test.ts tests/editor-roundtrip.test.ts`. Expected: the new test fails (or passes if the schema is already right; keep it as a guard). Round-trip passes.
- [ ] **Step 3: Implement** the schema option, `chart-node-view.tsx`, the handle methods, and the toolbar tool.
- [ ] **Step 4: Run** `pnpm test`. Expected: PASS.
- [ ] **Step 5: Verify in the running app.** With the dialog not built yet, paste the spec example as raw Markdown (Markdown mode), then switch to Rich mode:
  - The chart shows with an Edit button.
  - Arrow keys and Backspace select and delete it as a block.
  - Ordinary ` ```ts ` blocks are still editable text.
  - Saving and reloading leaves the body byte-identical (check with Export .md).
- [ ] **Step 6: Commit:** `feat(editor): show chart blocks as rendered charts`

---

### Task 8: Full-screen chart dialog

**Files:**
- Create: `components/admin/editor/ChartDialog.tsx`
- Modify: `components/admin/editor/PostEditor.tsx`, `components/admin/editor/ProjectEditor.tsx` (own the dialog's open state and wire `onAddChart` / `onEditChart` to `insertChart` / `replaceChart` on the editor ref)
- Test: `e2e/flows/05-charts.mjs`

**Interfaces:**
- Consumes: `parseTable`, `parseNumber`, `xKindOf`, `suggestType`, `toCsv` (Task 2); `parseChart`, `serializeChart`, `ChartSpec` (Task 3); `PALETTE`, `colorVar` (Task 3); `ChartView` (Task 5); `insertChart`, `replaceChart` (Task 7).
- Produces: `ChartDialog({ open, initial, onCancel, onSave }: { open: boolean; initial?: string; onCancel(): void; onSave(source: string): void })`. `initial` is an existing block's inner text, used in edit mode.

Behavior, from the spec's "How a writer uses it" section:
- **Shell:**
  - Full-screen overlay with `role="dialog"`, `aria-modal`, and the heading "Add a chart" (or "Edit chart" when `initial` is set). Esc and Cancel close it without changes.
  - Body scroll is locked while open.
  - Layout: settings on the left, live `ChartView` preview on the right. Stacked on narrow screens.
- **Paste:**
  - A labeled textarea "Paste your data".
  - On change, it shows a found-summary: `<n> rows · x-axis <name> (dates|numbers|categories) · series <a>, <b>`.
  - It shows inline errors from `parseTable` / `parseChart`.
  - In edit mode, the textarea is prefilled with the block's CSV.
- **Type:** a segmented control with 5 types, preselected by `suggestType`, showing its `reason`. The user's choice sticks after re-pasting.
- **Optional settings:**
  - Layout segmented control, shown only with ≥ 2 series. "Two axes" is disabled unless there are exactly 2.
  - Title, Caption, X label.
  - A per-series swatch picker (8 `PALETTE` swatches with names as `title`/`aria-label`), plus an optional unit input.
  - A markers list (x + label rows, "+ Add marker").
- **Save:**
  - Insert/Save is enabled only when `parseChart(serializeChart(draft))` is ok.
  - `onSave` receives `serializeChart(spec)`.
  - Focus returns to the editor.
- **Style:** `components/admin/ui.tsx` primitives (`buttonPrimary`, `buttonSecondary`, `label`, `input`), Fraunces italic heading, square corners. The reference layout is `.superpowers/brainstorm/952-1793069099/content/chart-dialog.html`.

- [ ] **Step 1: Write the failing e2e flow** `e2e/flows/05-charts.mjs`, modeled on `02-writing.mjs` (editor session, its own unique post), with these steps:
  1. Create a post and click the `Chart` toolbar button.
  2. Fill "Paste your data" with 26 tab-separated weekly rows: `week\tLead time (days)\tMTTR (hours)`.
  3. Assert the summary text contains `26 rows` and `dates`, and that `Line` is pressed.
  4. Choose `Stacked`, set the title `Faster to ship, slower to fix`, and add the marker `2026-06-08` / `AI rollout`.
  5. Click `Insert chart`.
  6. Assert the editor shows an `svg` inside a chart node, and that the Site preview column has `figure.chart[data-hydrated] svg`.
  7. Wait for Saved, then publish (confirm warnings).
  8. `GET` the live page. The HTML contains `figure class="chart"` and `table class="chart-data"`.
  9. Open the live page in the browser and find a chart `svg`.
  10. Click Edit, change the title, save, and reload. Markdown mode shows the new title.
- [ ] **Step 2: Run** `pnpm db:up && pnpm test:e2e --only=charts`. Expected: FAIL (no Chart button).
- [ ] **Step 3: Implement** `ChartDialog` and the wiring in both editors.
- [ ] **Step 4: Run** `pnpm test:e2e --only=charts`, then the full `pnpm test:e2e`. Expected: PASS, with the existing flows unaffected. Also run `pnpm test:e2e --only=charts --screenshots=<scratch dir>` and attach the light/dark screenshots for the reviewer.
- [ ] **Step 5: Run** `pnpm test && pnpm lint && pnpm build`. Expected: all PASS, and `scripts/seo-audit.mjs` (run by build) passes.
- [ ] **Step 6: Commit:** `feat(editor): full-screen dialog to add and edit charts`
