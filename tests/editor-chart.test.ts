import { describe, expect, it } from "vitest";
import { MarkdownManager } from "@tiptap/markdown";
import { chartNode, editorExtensions } from "../lib/cms/editor-schema";

// Chart blocks are one atom node in the editor; what insertChart/replaceChart
// put into the document must save as the same fenced block the site renders.
// vitest has no DOM, so this serializes the node JSON the editor handle
// inserts rather than driving a live editor.
const manager = new MarkdownManager({ extensions: editorExtensions() });
const SOURCE = "type: line\ntitle: Weekly\n---\nweek,Visits\n2026-04-27,4\n\n2026-05-04,6";
const FENCE = "```chart\n" + SOURCE + "\n```";

describe("chart blocks in the rich editor", () => {
  it("is the chart node the handle inserts", () => {
    expect(chartNode(SOURCE)).toEqual({ type: "chart", attrs: { source: SOURCE } });
  });

  it("saves an inserted chart as a ```chart fence", () => {
    const doc = { type: "doc", content: [chartNode(SOURCE)] };
    expect(manager.serialize(doc)).toBe(FENCE);
  });

  it("reads the fence back as one chart node", () => {
    const doc = manager.parse(FENCE);
    expect(doc.content).toEqual([chartNode(SOURCE)]);
  });

  it("keeps the chart's neighbours as separate blocks", () => {
    const md = `Before\n\n${FENCE}\n\nAfter`;
    const doc = manager.parse(md);
    expect(doc.content?.map((n) => n.type)).toEqual(["paragraph", "chart", "paragraph"]);
    expect(manager.serialize(doc)).toBe(md);
  });

  it("leaves other code blocks as code blocks", () => {
    const doc = manager.parse("```ts\nconst x = 1;\n```\n\n```\nplain\n```");
    expect(doc.content?.map((n) => [n.type, n.attrs?.language])).toEqual([
      ["codeBlock", "ts"],
      ["codeBlock", null],
    ]);
  });
});
