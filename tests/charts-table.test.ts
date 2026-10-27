import { describe, it, expect } from "vitest";
import { parseNumber, parseTable, suggestType, toCsv, xKindOf } from "../lib/charts/table";

describe("parseTable", () => {
  it("reads tab-separated data from a spreadsheet", () => {
    const r = parseTable("week\tA\tB\n2026-04-27\t4.3\t3.0\n2026-05-04\t4.2\t3.1");
    expect(r).toEqual({
      ok: true,
      columns: ["week", "A", "B"],
      rows: [
        ["2026-04-27", "4.3", "3.0"],
        ["2026-05-04", "4.2", "3.1"],
      ],
    });
  });

  it("keeps a quoted CSV cell with a comma as one cell", () => {
    const r = parseTable('x,y\na,"1,234"\nb,2');
    expect(r).toMatchObject({
      ok: true,
      rows: [
        ["a", "1,234"],
        ["b", "2"],
      ],
    });
  });

  it("handles escaped quotes and embedded newlines", () => {
    const r = parseTable('x,y\n"say ""hi""","a\nb"\nc,d');
    expect(r).toMatchObject({
      ok: true,
      rows: [
        ['say "hi"', "a\nb"],
        ["c", "d"],
      ],
    });
  });

  it("drops blank lines and trims cells", () => {
    const r = parseTable(" a , b \n\n 1 , 2 \n3,4\n\n");
    expect(r).toMatchObject({
      ok: true,
      columns: ["a", "b"],
      rows: [
        ["1", "2"],
        ["3", "4"],
      ],
    });
  });

  it("needs at least two data rows", () => {
    expect(parseTable("a,b\n1,2").ok).toBe(false);
  });

  it("needs at least two columns", () => {
    expect(parseTable("a\n1\n2").ok).toBe(false);
  });

  it("names the ragged row", () => {
    const r = parseTable("a,b\n1,2\n3\n4,5");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("row 3");
  });
});

describe("parseNumber", () => {
  it("strips thousands separators, currency and percent signs", () => {
    expect(parseNumber("1,234")).toBe(1234);
    expect(parseNumber("45%")).toBe(45);
    expect(parseNumber("$12")).toBe(12);
    expect(parseNumber(" 3.0 ")).toBe(3);
  });

  it("treats an empty cell as a gap", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("  ")).toBeNull();
  });

  it("rejects non-numbers", () => {
    expect(parseNumber("n/a")).toBeUndefined();
    expect(parseNumber("Infinity")).toBeUndefined();
    expect(parseNumber("1e")).toBeUndefined();
  });
});

describe("xKindOf", () => {
  it("infers dates, numbers and categories", () => {
    expect(xKindOf(["2026-04", "2026-05"])).toBe("time");
    expect(xKindOf(["2026-04-27", "2026-05-04"])).toBe("time");
    expect(xKindOf(["1", "2.5"])).toBe("number");
    expect(xKindOf(["Q1", "Q2"])).toBe("category");
    expect(xKindOf(["2026-04", "Q2"])).toBe("category");
  });
});

describe("suggestType", () => {
  it("suggests line for dates and numbers", () => {
    expect(suggestType("time", 2, 26)).toEqual({ type: "line", reason: "line, because x is dates" });
    expect(suggestType("number", 1, 10).reason).toBe("line, because x is numbers");
  });

  it("suggests bar for categories, never pie", () => {
    expect(suggestType("category", 1, 5).type).toBe("bar");
    expect(suggestType("category", 1, 5).reason).toBe("bar, because x is categories");
  });
});

describe("toCsv", () => {
  it("quotes cells with commas, quotes or newlines", () => {
    expect(toCsv(["a", "b"], [["x,y", "2"]])).toBe('a,b\n"x,y",2');
    expect(toCsv(["a"], [['q"q'], ["l\nl"]])).toBe('a\n"q""q"\n"l\nl"');
  });
});
