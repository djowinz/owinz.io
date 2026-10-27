import { describe, it, expect } from "vitest";
import { markdownToHtml } from "../lib/content/render";
import { parseChart } from "../lib/charts/spec";

const SOURCE = "type: bar\ntitle: Sales\ncaption: By quarter\n---\nq,v\nQ1,1\nQ2,";
const block = (src: string) => "```chart\n" + src + "\n```";

const unescape = (s: string) =>
  s.replace(/&#x22;|&quot;/g, '"').replace(/&#x26;|&amp;/g, "&").replace(/&#x3C;|&lt;/g, "<");

describe("chart blocks in markdownToHtml", () => {
  it("renders a figure with the spec and a fallback data table", async () => {
    const html = await markdownToHtml(block(SOURCE));
    expect(html.match(/<figure class="chart"/g)).toHaveLength(1);
    const attr = html.match(/data-chart="([^"]*)"/)![1];
    const parsed = parseChart(SOURCE);
    if (!parsed.ok) throw new Error("fixture invalid");
    expect(JSON.parse(unescape(attr))).toEqual(parsed.spec);
    expect(html).toContain('<table class="chart-data">');
    expect(html.match(/<tbody>[\s\S]*<\/tbody>/)![0].match(/<tr>/g)).toHaveLength(2);
    expect(html).toContain('<span class="chart-title">Sales</span>');
    expect(html).toContain('<span class="chart-caption">By quarter</span>');
    expect(html).not.toContain("hljs");
  });

  it("appends units to series headings", async () => {
    const html = await markdownToHtml(block("type: line\nseries:\n  v: { unit: kg }\n---\nq,v\nA,1\nB,2"));
    expect(html).toContain("<th>v (kg)</th>");
  });

  it("shows the first error and the raw block for an invalid chart", async () => {
    const html = await markdownToHtml(block("type: donut\n---\nq,v\nQ1,1"));
    expect(html).toContain('<figure class="chart chart-error">');
    expect(html).toContain("Chart couldn't be drawn:");
    expect(html).toContain("type: donut");
    expect(html).not.toContain("data-chart");
  });

  it("escapes titles", async () => {
    const html = await markdownToHtml(
      block('type: bar\ntitle: "<script>alert(1)</script> & \\"q\\""\n---\nq,v\nQ1,1\nQ2,2'),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&#x3C;script>alert(1)&#x3C;/script> &#x26; \"q\"");
  });

  it("still highlights other code blocks", async () => {
    const html = await markdownToHtml("```ts\nconst a = 1;\n```");
    expect(html).toContain("hljs");
  });
});
