import { describe, expect, it } from "vitest";
import { getSchema, type JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { chartInsertPos } from "../lib/cms/chart-insert";
import { chartNode, editorExtensions } from "../lib/cms/editor-schema";
import { chartSources } from "../lib/charts/spec";
import { markdownToHtml } from "../lib/content/render";

// insertChart (RichEditor) replaces chartInsertPos's range with a chart node.
// Wherever the caret is, the saved Markdown must hold the chart as a top-level
// ```chart block that the site renders and that reads back unchanged.
const extensions = editorExtensions();
const schema = getSchema(extensions);
const manager = new MarkdownManager({ extensions });
const SOURCE = "type: bar\ntitle: T\n---\nq,v\nQ1,1\nQ2,2";
const FENCE = "```chart\n" + SOURCE + "\n```";

const docOf = (content: JSONContent) => schema.nodeFromJSON(content);
const fromMarkdown = (md: string) => docOf(manager.parse(md));

/** A caret at the start of the first textblock `pick` accepts. */
function caretIn(doc: PMNode, pick: (node: PMNode) => boolean): EditorState {
  let pos = -1;
  doc.descendants((node, p) => {
    if (pos === -1 && node.isTextblock && pick(node)) pos = p + 1;
    return pos === -1;
  });
  if (pos === -1) throw new Error("no such textblock");
  return EditorState.create({ doc, selection: TextSelection.create(doc, pos) });
}

function insert(state: EditorState): string {
  const [from, to] = chartInsertPos(state);
  const tr = state.tr.replaceWith(from, to, schema.nodeFromJSON(chartNode(SOURCE)));
  return manager.serialize(tr.doc.toJSON());
}

async function expectTopLevelChart(md: string) {
  // Its own blank-line-separated block, at the start of a line.
  expect(`\n${md}\n`).toContain(`\n\n${FENCE}\n`);
  expect(chartSources(md)).toEqual([SOURCE]);
  expect((await markdownToHtml(md)).match(/<figure class="chart"/g)).toHaveLength(1);
  expect(manager.serialize(manager.parse(md))).toBe(md);
}

describe("chartInsertPos", () => {
  it("goes after the paragraph holding the caret", async () => {
    const md = insert(caretIn(fromMarkdown("One\n\nTwo"), (n) => n.textContent === "One"));
    expect(md).toBe(`One\n\n${FENCE}\n\nTwo`);
    await expectTopLevelChart(md);
  });

  it("replaces an empty top-level paragraph", async () => {
    const doc = docOf({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }, { type: "paragraph" }] });
    const md = insert(caretIn(doc, (n) => n.content.size === 0));
    expect(md).toBe(`One\n\n${FENCE}`);
    await expectTopLevelChart(md);
  });

  it("goes after a list, not into the item", async () => {
    const md = insert(caretIn(fromMarkdown("- one\n- two\n\nAfter"), (n) => n.textContent === "two"));
    expect(md).toBe(`- one\n- two\n\n${FENCE}\n\nAfter`);
    await expectTopLevelChart(md);
  });

  it("goes after a list from an empty list item", async () => {
    const doc = docOf({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] },
            { type: "listItem", content: [{ type: "paragraph" }] },
          ],
        },
      ],
    });
    const md = insert(caretIn(doc, (n) => n.content.size === 0));
    expect(md.endsWith(`\n\n${FENCE}`)).toBe(true);
    await expectTopLevelChart(md);
  });

  it("goes after a blockquote", async () => {
    const md = insert(caretIn(fromMarkdown("> quoted"), (n) => n.textContent === "quoted"));
    expect(md).toBe(`> quoted\n\n${FENCE}`);
    await expectTopLevelChart(md);
  });

  it("goes after a table, leaving the cell alone", async () => {
    const table = "| a | b |\n| --- | --- |\n| x | y |";
    const before = manager.serialize(manager.parse(table));
    const md = insert(caretIn(fromMarkdown(table), (n) => n.textContent === "x"));
    expect(md).toBe(`${before}\n\n${FENCE}`);
    await expectTopLevelChart(md);
  });

  it("goes after a selected image", async () => {
    const doc = fromMarkdown("![alt](a.jpg)\n\nAfter");
    let at = -1;
    doc.descendants((node, p) => {
      if (at === -1 && node.type.name === "image") at = p;
      return at === -1;
    });
    const state = EditorState.create({ doc, selection: NodeSelection.create(doc, at) });
    const md = insert(state);
    expect(md).toBe(`![alt](a.jpg)\n\n${FENCE}\n\nAfter`);
    await expectTopLevelChart(md);
  });
});
