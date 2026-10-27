import { describe, expect, it } from "vitest";
import { chartSources, parseChart, serializeChart } from "../lib/charts/spec";

const EXAMPLE = `type: line
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
2026-05-04,4.2,3.1`;

const BAR = `type: bar
title: Quarterly
---
quarter,Revenue,Cost
Q1,10,4
Q2,12,
Q3,15,6`;

const DUAL = `type: line
layout: dual
series:
  Sales: { unit: "$" }
  Rate: { unit: "%" }
---
month,Sales,Rate
2026-01,100,2.5
2026-02,120,3.1`;

function errorsOf(src: string): string[] {
  const r = parseChart(src);
  if (r.ok) throw new Error("expected failure");
  return r.errors;
}

describe("parseChart", () => {
  it("parses the spec example", () => {
    const r = parseChart(EXAMPLE);
    if (!r.ok) throw new Error(r.errors.join("; "));
    expect(r.spec.layout).toBe("stacked");
    expect(r.spec.x).toEqual({ name: "week", label: "Week", kind: "time" });
    expect(r.spec.series.map((s) => s.unit)).toEqual(["d", "h"]);
    expect(r.spec.series[1].axis).toBe("right");
    expect(r.spec.rows).toHaveLength(2);
    expect(r.spec.rows[0]).toEqual({ x: "2026-04-27", values: [4.3, 3] });
    expect(r.spec.markers[0].label).toBe("AI rollout");
    expect(r.warnings).toEqual([]);
  });

  it("requires a valid type", () => {
    expect(errorsOf("layout: single\n---\na,b\n1,2\n3,4")[0]).toMatch(/type/);
    expect(errorsOf("type: donut\n---\na,b\n1,2\n3,4")[0]).toMatch(/type/);
  });

  it("rejects an unknown layout", () => {
    expect(errorsOf("type: line\nlayout: wide\n---\na,b\n1,2\n3,4")[0]).toMatch(/layout/);
  });

  it("requires exactly 2 series for dual", () => {
    expect(errorsOf("type: line\nlayout: dual\n---\na,b\n1,2\n3,4")[0]).toMatch(/dual/);
  });

  it("rejects a series that isn't a column", () => {
    const src = "type: line\nseries:\n  Nope: { color: rust }\n---\na,b\n1,2\n3,4";
    expect(errorsOf(src)).toContain('series "Nope" isn\'t a column');
  });

  it("rejects an unknown color", () => {
    const src = "type: line\nseries:\n  b: { color: chartreuse }\n---\na,b\n1,2\n3,4";
    expect(errorsOf(src)[0]).toMatch(/chartreuse/);
  });

  it("defaults the second dual series to the right axis", () => {
    const r = parseChart(DUAL);
    if (!r.ok) throw new Error(r.errors.join("; "));
    expect(r.spec.series.map((s) => s.axis)).toEqual(["left", "right"]);
    expect(r.spec.series.map((s) => s.color)).toEqual(["violet", "rust"]);
  });

  it("rejects non-numeric cells with the row number", () => {
    expect(errorsOf("type: line\n---\na,b\n1,2\n2,abc")).toContain('"abc" in b isn\'t a number (row 3)');
  });

  it("rejects an all-empty series", () => {
    expect(errorsOf("type: line\n---\na,b,c\n1,2,\n2,3,")[0]).toMatch(/c/);
  });

  it("requires category markers to match a row", () => {
    const src = "type: bar\nmarkers:\n  - x: Q9\n    label: Launch\n---\nq,v\nQ1,1\nQ2,2";
    expect(errorsOf(src)).toContain('marker "Launch" doesn\'t match any row');
  });

  it("requires time markers to be dates", () => {
    const src = "type: line\nmarkers:\n  - x: soon\n    label: Launch\n---\nd,v\n2026-01-01,1\n2026-02-01,2";
    expect(errorsOf(src)[0]).toMatch(/Launch/);
  });

  it("rejects markers on pie", () => {
    const src = "type: pie\nmarkers:\n  - x: Q1\n    label: Launch\n---\nq,v\nQ1,1\nQ2,2";
    expect(errorsOf(src)[0]).toMatch(/pie/);
  });

  it("warns on unknown keys", () => {
    const r = parseChart("type: bar\nfoo: 1\n---\nq,v\nQ1,1\nQ2,2");
    expect(r.ok && r.warnings).toEqual(['unknown setting "foo"']);
  });

  it("coerces numeric YAML scalars to strings", () => {
    const r = parseChart("type: bar\ntitle: 2026\n---\nq,v\nQ1,1\nQ2,2");
    expect(r.ok && r.spec.title).toBe("2026");
  });

  it("errors on a missing separator or bad YAML", () => {
    expect(errorsOf("type: bar\nq,v\nQ1,1")[0]).toMatch(/---/);
    expect(errorsOf("type: [\n---\nq,v\nQ1,1\nQ2,2")[0]).toMatch(/YAML/);
  });
});

describe("serializeChart", () => {
  for (const [name, src] of [["example", EXAMPLE], ["bar", BAR], ["dual", DUAL]] as const) {
    it(`round-trips ${name}`, () => {
      const first = parseChart(src);
      if (!first.ok) throw new Error(first.errors.join("; "));
      const text = serializeChart(first.spec);
      const second = parseChart(text);
      expect(second).toEqual(first);
      expect(serializeChart((second as typeof first).spec)).toBe(text);
    });
  }

  it("omits defaults", () => {
    const r = parseChart("type: bar\nlayout: single\nseries:\n  v: { color: violet }\n---\nq,v\nQ1,1\nQ2,2");
    if (!r.ok) throw new Error("bad");
    const text = serializeChart(r.spec);
    expect(text).not.toContain("layout:");
    expect(text).not.toContain("color:");
    expect(text).toBe("type: bar\n---\nq,v\nQ1,1\nQ2,2");
  });

  it("writes the canonical example", () => {
    const r = parseChart(EXAMPLE);
    if (!r.ok) throw new Error("bad");
    expect(serializeChart(r.spec)).toBe(
      EXAMPLE.replace("color: violet, ", "").replace("color: rust, ", "").replace("3.0", "3"),
    );
  });

  it("quotes only where YAML needs it", () => {
    const r = parseChart('type: bar\ntitle: "a: b"\ncaption: "123"\n---\nq,v\nQ1,1\nQ2,2');
    if (!r.ok) throw new Error("bad");
    const text = serializeChart(r.spec);
    expect(text).toContain('title: "a: b"');
    expect(text).toContain('caption: "123"');
  });
});

describe("chartSources", () => {
  it("finds only chart fences", () => {
    const md = "a\n\n```chart\ntype: bar\n---\nq,v\nQ1,1\nQ2,2\n```\n\n```ts\nx\n```";
    expect(chartSources(md)).toHaveLength(1);
    expect(chartSources(md)).toHaveLength(1);
  });

  it("allows blank lines and ignores other info strings", () => {
    const md = "```chart\ntype: bar\n\n---\nq,v\n\nQ1,1\n```\n\n```chartx\nno\n```";
    expect(chartSources(md)).toEqual(["type: bar\n\n---\nq,v\n\nQ1,1"]);
  });
});
