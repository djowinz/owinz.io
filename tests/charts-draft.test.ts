import { describe, it, expect } from "vitest";
import { analyzeData, buildDraft, emptySettings, fromSource, summarize } from "../lib/charts/draft";
import { parseChart } from "../lib/charts/spec";

const TWO = "week\tLead time (days)\tMTTR (hours)\n2026-04-27\t4.3\t3.3\n2026-05-04\t4.5\t3.1\n2026-05-11\t4.3\t2.8";

describe("analyzeData", () => {
  it("summarizes what it found and suggests a type", () => {
    const a = analyzeData(TWO);
    if (!a.ok) throw new Error(a.errors.join());
    expect(summarize(a)).toBe("3 rows · x-axis week (dates) · series Lead time (days), MTTR (hours)");
    expect(a.suggestion).toEqual({ type: "line", reason: "line, because x is dates" });
  });

  it("passes table errors through", () => {
    expect(analyzeData("a,b\n1,2")).toEqual({ ok: false, errors: ["Need a header row and at least two rows of data."] });
  });
});

describe("buildDraft", () => {
  it("serializes a canonical block from the data and settings", () => {
    const a = analyzeData(TWO);
    if (!a.ok) throw new Error();
    const r = buildDraft(a, {
      ...emptySettings(),
      layout: "stacked",
      title: " Faster to ship, slower to fix ",
      markers: [{ x: "2026-05-04", label: "AI rollout" }, { x: "", label: "" }],
    });
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(r.source).toBe(
      [
        "type: line",
        "layout: stacked",
        "title: Faster to ship, slower to fix",
        "markers:",
        "  - x: 2026-05-04",
        "    label: AI rollout",
        "---",
        "week,Lead time (days),MTTR (hours)",
        "2026-04-27,4.3,3.3",
        "2026-05-04,4.5,3.1",
        "2026-05-11,4.3,2.8",
      ].join("\n"),
    );
    expect(parseChart(r.source).ok).toBe(true);
  });

  it("keeps a chosen type, colors and units by series name", () => {
    const a = analyzeData(TWO);
    if (!a.ok) throw new Error();
    const r = buildDraft(a, {
      ...emptySettings(),
      type: "area",
      colors: { "MTTR (hours)": "teal" },
      units: { "Lead time (days)": "days" },
    });
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.spec.type).toBe("area");
    expect(r.spec.series.map((s) => [s.color, s.unit])).toEqual([
      ["violet", "days"],
      ["teal", undefined],
    ]);
  });

  it("falls back to one chart when the layout doesn't fit the series", () => {
    const a = analyzeData("x,a\n1,2\n2,3");
    if (!a.ok) throw new Error();
    const r = buildDraft(a, { ...emptySettings(), layout: "dual" });
    expect(r.ok && r.spec.layout).toBe("single");
  });

  it("reports cells that aren't numbers and other spec errors", () => {
    const bad = analyzeData("x,a\n1,2\n2,abc");
    if (!bad.ok) throw new Error();
    expect(buildDraft(bad, emptySettings())).toEqual({ ok: false, errors: ['"abc" in a isn\'t a number (row 3)'] });

    const a = analyzeData(TWO);
    if (!a.ok) throw new Error();
    const r = buildDraft(a, { ...emptySettings(), markers: [{ x: "2026-05-04", label: "" }] });
    expect(r).toEqual({ ok: false, errors: ["Each marker needs an x and a label."] });
  });
});

describe("fromSource", () => {
  it("recovers the CSV and settings of an existing block", () => {
    const source = [
      "type: bar",
      "layout: dual",
      "title: Hello",
      'x: { label: "Week of" }',
      "series:",
      "  b: { color: gold, unit: ms }",
      "---",
      "x,a,b",
      "q1,1,2",
      "q2,3,4",
    ].join("\n");
    const { csv, settings } = fromSource(source);
    expect(csv).toBe("x,a,b\nq1,1,2\nq2,3,4");
    expect(settings).toEqual({
      type: "bar",
      layout: "dual",
      title: "Hello",
      caption: "",
      xLabel: "Week of",
      colors: { a: "violet", b: "gold" },
      units: { b: "ms" },
      axes: { a: "left", b: "right" },
      markers: [],
    });
    const a = analyzeData(csv);
    if (!a.ok) throw new Error();
    const r = buildDraft(a, settings);
    expect(r.ok && r.source).toBe(source.replace('"Week of"', "Week of"));
  });

  it("keeps hand-written axes on a two-axes chart through an edit", () => {
    const source = [
      "type: line",
      "layout: dual",
      "title: Before",
      "series:",
      "  a: { axis: right }",
      "  b: { axis: left }",
      "---",
      "x,a,b",
      "1,1,2",
      "2,3,4",
    ].join("\n");
    const { csv, settings } = fromSource(source);
    const a = analyzeData(csv);
    if (!a.ok) throw new Error();
    const r = buildDraft(a, { ...settings, title: "After" });
    expect(r.ok && r.source).toBe(source.replace("Before", "After"));
    // Off two axes, the axes go back to their defaults.
    const stacked = buildDraft(a, { ...settings, layout: "stacked" });
    expect(stacked.ok && stacked.spec.series.map((s) => s.axis)).toEqual(["left", "left"]);
  });
});
