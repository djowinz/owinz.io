# Inline charts in posts — design

Status: draft for approval · 2026-10-26

## Why

Most of what Dyllen shows in his writing is data, code, or design. Code already renders well; data currently means a static screenshot of a chart, which goes stale, can't be read by screen readers or search engines, and ignores the site's theme and dark mode. The first post that needs this is about AI in his engineering org: lead time to change falling while mean time to resolution rises over the last two quarters, with the AI rollout marked. That post is waiting on this feature.

This is also the groundwork for the future CMS AI writing assistant, which should be able to propose charts from data the same way a writer inserts them. The assistant is out of scope here.

## Goals

- A writer can turn data pasted from any spreadsheet into an interactive chart in a post, without leaving the editor, in under a minute.
- The chart looks like part of owinz.io: theme colors, fonts, light and dark mode.
- What the writer sees in the editor and in the site preview is what readers get.
- Markdown stays the source of truth. A chart is plain, readable, hand-editable text in the post body.

## Non-goals

- Covering every chart case. The tool offers a small set of types and options with sensible defaults. If a chart needs more, the data gets reshaped before pasting. New options get added only when a real post needs them.
- Formulas, transforms, live or remote data sources, file uploads, per-point styling, custom hex colors, chart animations beyond Recharts defaults.
- Design visuals (mockups, screenshots). Those stay images.
- The AI assistant.

## Anti-goals (failure even if it "works")

- A large, fragile pile of custom TipTap logic. The editor addition must be one small, isolated extension. Removing it leaves the editor working and the chart blocks visible as ordinary code blocks.
- Writing our own charting. Rendering uses an off-the-shelf library (Recharts).
- Anything that changes or corrupts stored Markdown. The existing editor round-trip tests must keep passing, and chart blocks must round-trip byte-for-byte.
- A chart that looks one way in the CMS preview and another way on the live site.

## Decisions (made with Dyllen)

- **Library: Recharts.** Already in `package.json` (2.15.0), unused, MIT. Chosen over react-apexcharts, which moved to a dual commercial license at v5. It covers dual axes (`yAxisId`), marker lines (`ReferenceLine`), and stacked charts with synced tooltips (`syncId`).
- **Both layouts for multi-series charts**: one chart with two Y axes, or stacked charts on a shared X axis. The writer picks per chart.
- **Colors come from a fixed, theme-compliant palette** that the writer picks from per series. No automatic color logic beyond default palette order, and no custom hex.
- **Entry point: a Chart button in the editor toolbar** opens a **full-screen dialog** over the editor. The dialog is an overlay, not a route, so the draft, cursor, and autosave are untouched.
- **The chart renders in the site preview** (the editor's preview column and the full-page draft preview) exactly as on the live article.

## How a writer uses it

1. Put the cursor where the chart goes and click **Chart** in the toolbar (next to the existing code-block button in `RichEditor.tsx`).
2. A full-screen dialog opens. On the left are the settings, on the right a large live preview.
3. **Paste data** (required). It's tab-separated from a spreadsheet, or CSV. The first row is column names, the first column is the X axis, and the other columns are series. The dialog reports what it found, e.g. "26 rows · x-axis *week* (dates) · series *Lead time (days)*, *MTTR (hours)*", and flags problems inline: non-numeric cells in a series, ragged rows, fewer than 2 rows.
4. **Chart type**: line, bar, area, scatter, pie. It is pre-selected from the data shape and shows why ("line, because x is dates"):
   - dates or ordered numbers on X → line
   - text categories → bar
   - one series with ≤ 8 rows of categories → offered pie, but defaults to bar
5. **Optional settings**:
   - Title.
   - Caption.
   - Layout, shown only with 2+ series: *one chart* (shared axis), *stacked*, or *two axes*. Two axes is offered only with exactly 2 series.
   - Series color: a swatch picker per series, defaulting to palette order.
   - X/Y axis labels.
   - Markers: zero or more `{x, label}` vertical reference lines, e.g. "2026-06-08 · AI rollout". Markers apply to line, area, bar, and scatter.
6. **Insert chart** puts the block at the cursor. In the editor the block appears as the rendered chart with an **Edit** button. Edit reopens the dialog pre-filled, and Save replaces the block. Deleting works like any other block.
7. The preview column and the full-page preview show the interactive chart. Hovering a point shows the exact values.

The dialog works on mobile as a full-screen sheet, with settings and preview stacked.

## Stored format

A fenced code block with the info string `chart`. The header is YAML, then a `---` line, then the data as CSV with a header row. The dialog always writes CSV, regardless of what was pasted.

````markdown
```chart
type: line
layout: stacked
title: Faster to ship, slower to fix
caption: Weekly, May–Oct 2026.
x: { label: Week }
series:
  Lead time (days): { color: violet, unit: d }
  MTTR (hours): { color: rust, axis: right, unit: h }
markers:
  - x: 2026-06-08
    label: AI rollout
---
week,Lead time (days),MTTR (hours)
2026-04-27,4.3,3.0
2026-05-04,4.2,3.1
```
````

Rules:
- **X axis kind** (my call): if every X value parses as an ISO date (`YYYY-MM-DD`, or `YYYY-MM`), the X axis is a real **time scale**. The parser converts values to timestamps, Recharts uses a numeric `XAxis` with date tick formatting, and a marker may fall between rows. If every X value is numeric, it's a numeric scale. Otherwise it's **categorical**, and a marker's `x` must exactly match a row's X value. A mismatch is a parse error ("marker 'AI rollout' doesn't match any row").
- **Units** (my call): a series may set `unit` (e.g. `unit: h`, `unit: "%"`). The unit is appended to that series' tick labels and tooltip values. In `stacked` layout, each panel is labeled with its series name. First-to-last summaries like "4.3d → 2.1d" from the early mockup are **not** generated; the writer puts takeaways in the caption.
- `type` is required. Everything else is optional with defaults: `layout: single`, colors in palette order, no title or caption.
- `series` keys must match CSV column names. A missing entry means defaults. `axis: right` is meaningful only with `layout: dual`.
- Values: `layout ∈ {single, stacked, dual}`, `type ∈ {line, bar, area, scatter, pie}`, `color ∈` palette names.
- One schema and parser, `lib/charts/spec.ts`, is shared by the dialog, the site renderer, the publish checks, and tests. It returns either a typed chart spec or a list of human-readable errors. It is a pure function with no React.
- Unknown keys are ignored but warned about at publish. The format can grow later without breaking old posts.
- **Hand edits vs. the dialog** (my call): "byte-for-byte" refers to the TipTap round-trip. Opening and saving a post must never change a chart block. Saving from the dialog is different: it **rewrites the block in canonical form** (fixed key order, CSV data). Hand-edited *values* survive because they're parsed. Hand *formatting* and YAML comments do not. Edit is disabled on a block that doesn't parse; the node view shows the error and says to fix it in Markdown mode. This avoids building a format-preserving YAML/CSV editor.

Example of a categorical chart (markers must name a row):
- x values `Q1, Q2, Q3` → bar; `markers: [{ x: Q2, label: Reorg }]` is valid, `x: Q2.5` is an error.

## Palette

A named set of 6–8 colors defined in `app/globals.css` as CSS custom properties, each with a light and a dark value, e.g. `--chart-violet` (= `--accent`), `--chart-rust`, …. Requirements:
- The first color is the site accent (`#7c3aed` light / `#b69bff` dark).
- Every color reaches at least 3:1 contrast against `--background` in its mode (`#f8f7f4` light, `#141311` dark).
- Adjacent palette colors stay distinguishable under common color-vision deficiencies.
- Charts reference colors by name and render with `var(--chart-<name>)`, so dark mode and future theme tweaks apply to every chart automatically.

Use the `dataviz` skill's palette method and validator to choose and verify the colors. Gridlines, axes, and text use the existing `--edge`, `--muted`, and `--foreground` tokens, with Geist Mono for tick labels to match the site's label style.

## Rendering architecture

The site renders Markdown to an HTML string (`markdownToHtml` in `lib/content/render.ts`), which is injected with `dangerouslySetInnerHTML` in three places:
- `components/ArticleView.tsx`: the live article and the full-page draft preview
- `components/admin/editor/PostEditor.tsx`: the preview column, via `renderDraftPreview` in `lib/cms/preview.ts`
- `components/admin/editor/ProjectEditor.tsx`, plus the project page `app/(site)/projects/[slug]/page.tsx`

Recharts is a client React component, so it can't live inside that string. The design:

1. **A rehype or remark plugin in `markdownToHtml`** turns each `chart` code block into a placeholder:
   - The placeholder is `<figure class="chart" data-chart="…">`. The attribute holds the parsed spec, serialized and safely escaped.
   - Inside it are a `<figcaption>` (title and caption) and a plain `<table>` of the data. The table is the no-JS, screen-reader, crawler, and RSS fallback. The live chart visually replaces it, but keeps it available to assistive tech, e.g. as a visually-hidden table or a "Show data" toggle.
   - An invalid block renders as a visible "chart couldn't be drawn: <first error>" note plus the raw block. It must never throw and break the page.
   - The plugin must run before `rehypeHighlight`, so highlighting doesn't eat the block.
2. **A small client component, `components/Charts.tsx`**, runs after the HTML mounts. It finds `figure.chart[data-chart]` inside its container and mounts a Recharts chart into each, using React portals or `createRoot`. It re-scans when the HTML changes, since the preview column updates as you type, and cleans up on unmount.
3. **The same component runs everywhere the article HTML appears**: next to the `prose` div in `ArticleView`, in the PostEditor preview column, and in the ProjectEditor preview and project page. Preview parity with the live site comes from everything sharing one renderer and one hydrator.
4. **The chart renderer, `components/charts/ChartView.tsx`**, maps a spec to Recharts:
   - `ResponsiveContainer`
   - `LineChart`, `BarChart`, `AreaChart`, `ScatterChart`, or `PieChart`
   - `layout: dual` → two `YAxis` with `yAxisId`
   - `layout: stacked` → one chart per series sharing a `syncId`
   - markers → `ReferenceLine` with a label
   - tooltip styled with site tokens
   It is used by the hydrator, the dialog preview, and the editor node view, so all three are pixel-identical.
5. **Recharts is loaded only on pages that contain a chart**, for example by dynamically importing `ChartView` when the hydrator finds a placeholder. Articles without charts pay nothing.

Draft previews need nothing new. They already go through `markdownToHtml`.

**Text-only outputs** (my call):
- The fallback meta description built from the raw body (`summarize(body)` in `lib/content/render.ts`, used when there's no excerpt) **strips chart blocks**, so CSV rows never show up in search snippets.
- `llms.txt` / `llms-full.txt` (`lib/llms.ts`) **keep the raw chart block**, because the data in it is useful, readable context for LLM crawlers.
- The RSS feed gets the fallback table from the rendered HTML.

## Editor integration (TipTap)

- The block is stored as a normal fenced code block with `language: "chart"`. TipTap's StarterKit code block and `@tiptap/markdown` already round-trip it. **Verify this with a new case in `tests/editor-roundtrip.test.ts` before building anything else.** If the round-trip is lossy, stop and revisit.
- **One extension**, `lib/cms/editor-chart.ts` plus a React node view. It extends the code block so that when `language === "chart"`, it renders the block as `ChartView` (or the error note) with an Edit button, instead of editable text. Other code blocks are unaffected. Register it in `editorExtensions()` in `lib/cms/editor-schema.ts`, and keep the shared schema behavior intact for the round-trip tests.
- The node view is not editable in place. Editing happens only through the dialog. That avoids cursor and selection complexity inside the block.
- **Toolbar:** add a Chart button beside the code-block button in `RichEditor.tsx`. It opens the dialog. On insert, call `insertContent` with a `codeBlock` node with `language: "chart"` and the serialized text, at the saved selection.
- **Raw Markdown mode** (`MarkdownField.tsx`) shows the plain block text, and needs no change.
- Applies to **writing posts and projects**, since both use `RichEditor` and the same renderer. Talks have no rich body, so they are not included.

## Publish checks

Extend both validators: `lib/cms/validate.ts` (posts, via `checkAction`) and `lib/cms/validate-project.ts` (projects). They share the chart checks from `lib/charts/spec.ts`:
- **Error** (blocks publish): a chart block that fails to parse. Missing `type`, no data rows, non-numeric values in a series, a series config naming a column that doesn't exist, or an unknown color name.
- **Warning** (asks first): unknown keys, a pie chart with negative values or more than 8 slices, more than ~2,000 rows (performance), or a chart with no title or caption (accessibility and context).
- Messages name the chart by its title, or "chart N", and say what to fix.

## Testing

- **Unit (Vitest):**
  - `lib/charts/spec.ts` parsing and serialization, including valid and invalid cases, TSV-to-CSV paste conversion, and type inference.
  - Plugin output, covering the placeholder, the fallback table, the error note, and that HTML in labels is escaped.
  - The editor round-trip case, including round-trip stability of the dialog's serializer: parse → serialize → parse is identical.
- **E2E (Playwright, `e2e/flows/`):**
  1. Open a draft, click Chart, and paste TSV.
  2. Pick stacked, add a marker, and insert.
  3. Check that the chart appears in the editor and in the preview column.
  4. Publish, and check that the live article renders an SVG chart.
  5. Edit the chart and check that the change persists after reload.
- **Visual:** check light and dark mode on the article page. The palette passes the contrast validator.

## Left to the builder

- Exact palette hues beyond the accent, within the constraints above.
- The YAML parser choice. Something small; check what's already in the lockfile first. `gray-matter` already pulls in `js-yaml`.
- Exact dialog visuals, within the CMS look (`components/admin/ui.tsx`, Fraunces headings, mono labels, square corners). The mockup in `.superpowers/brainstorm/` is the reference layout.
- How the fallback table is hidden visually versus exposed.
- Pie-chart specifics.
- Number formatting in ticks and tooltips.

## Open risks

- `@tiptap/markdown` might normalize fenced-block content, e.g. trailing newlines or the info string. This is caught by the first round-trip test.
- Hydrating into injected HTML can race with the preview column's re-renders. Key the hydrator to the HTML string.
- `cacheComponents` and partial prerendering: the hydrator is a client component next to cached server HTML. Confirm against `node_modules/next/dist/docs/` that this composes cleanly.
