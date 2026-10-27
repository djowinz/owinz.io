import { describe, expect, it } from "vitest";
import { MarkdownManager } from "@tiptap/markdown";
import { chartNode, editorExtensions } from "../lib/cms/editor-schema";

// What insertChart/replaceChart put into the document must save as the same
// fenced block the site renders. vitest has no DOM, so this serializes the
// node JSON the editor handle inserts rather than driving a live editor.
const manager = new MarkdownManager({ extensions: editorExtensions() });
const SOURCE = "type: line\ntitle: Weekly\n---\nweek,Visits\n2026-04-27,4\n\n2026-05-04,6";

describe("chart blocks in the rich editor", () => {
  it("is the codeBlock node the handle inserts", () => {
    expect(chartNode(SOURCE)).toEqual({
      type: "codeBlock",
      attrs: { language: "chart" },
      content: [{ type: "text", text: SOURCE }],
    });
  });

  it("saves an inserted chart as a ```chart fence", () => {
    const doc = { type: "doc", content: [chartNode(SOURCE)] };
    expect(manager.serialize(doc)).toBe("```chart\n" + SOURCE + "\n```");
  });

  it("reads the fence back as the same node", () => {
    const doc = manager.parse("```chart\n" + SOURCE + "\n```");
    expect(doc.content?.[0]).toEqual(chartNode(SOURCE));
  });
});
