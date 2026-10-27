import { describe, it, expect } from "vitest";
import { markerX, toRechartsRows } from "../lib/charts/recharts-data";
import type { ChartSpec } from "../lib/charts/spec";

const base: ChartSpec = {
  type: "line",
  layout: "single",
  x: { name: "date", kind: "time" },
  series: [
    { name: "a", color: "violet", axis: "left" },
    { name: "b", color: "rust", axis: "left" },
  ],
  markers: [],
  rows: [
    { x: "2026-04-27", values: [1, null] },
    { x: "2026-05-04", values: [2, 3] },
  ],
};

describe("toRechartsRows", () => {
  it("converts time x to a UTC timestamp and gaps to null", () => {
    const rows = toRechartsRows(base);
    expect(rows[0].x).toBe(Date.UTC(2026, 3, 27));
    expect(rows[0].s0).toBe(1);
    expect(rows[0].s1).toBeNull();
    expect(rows[1].s1).toBe(3);
  });

  it("keeps category x as text", () => {
    const rows = toRechartsRows({
      ...base,
      type: "bar",
      x: { name: "q", kind: "category" },
      rows: [{ x: "Q1", values: [1, 2] }],
    });
    expect(rows[0].x).toBe("Q1");
  });

  it("converts number x and drops rows with unreadable time x", () => {
    const numeric = toRechartsRows({
      ...base,
      x: { name: "n", kind: "number" },
      rows: [{ x: "1,200", values: [1, 2] }],
    });
    expect(numeric[0].x).toBe(1200);
    expect(toRechartsRows({ ...base, rows: [{ x: "2026-99-99", values: [1, 2] }] })).toEqual([]);
  });
});

describe("markerX", () => {
  it("converts like x", () => {
    expect(markerX(base, { x: "2026-06-08", label: "Launch" })).toBe(Date.UTC(2026, 5, 8));
  });
  it("gives NaN for an impossible date instead of throwing", () => {
    expect(markerX(base, { x: "2026-99-99", label: "?" })).toBeNaN();
  });
});
