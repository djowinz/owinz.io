import { describe, expect, it } from "vitest";
import path from "path";
import { MarkdownManager } from "@tiptap/markdown";
import { editorExtensions } from "../lib/cms/editor-schema";
import { markdownEntries, writingSource, projectSource } from "../lib/content/files";
import { markdownToHtml } from "../lib/content/render";

// The rich-text editor reads Markdown in and writes Markdown out. Whatever it
// normalizes (list markers, emphasis style), the site must render the same.
const manager = new MarkdownManager({ extensions: editorExtensions() });
const roundTrip = (markdown: string) => manager.serialize(manager.parse(markdown));
const rendered = (markdown: string) => markdownToHtml(markdown).then((html) => html.replace(/\s+/g, " ").trim());

const CONTENT = path.join(process.cwd(), "content");
const real = [
  ...markdownEntries(path.join(CONTENT, "writing")).map((e) => [`writing/${e.slug}`, writingSource(e).body] as const),
  ...markdownEntries(path.join(CONTENT, "projects")).map((e) => [`projects/${e.slug}`, projectSource(e).body] as const),
];

describe("rich-text editor ↔ Markdown", () => {
  it.each(real)("round-trips %s without changing the rendered page", async (_, body) => {
    expect(await rendered(roundTrip(body))).toBe(await rendered(body));
  });

  it("keeps photo placement, captions, and alt text", () => {
    const md = '![Boats at dawn](harbor.jpg#right "Portland, 6am")\n\n![Plain](plain.png)';
    const out = roundTrip(md);
    expect(out).toContain('![Boats at dawn](harbor.jpg#right "Portland, 6am")');
    expect(out).toContain("![Plain](plain.png)");
  });

  it.each([
    ["code blocks with a language", "```ts\nconst x: number = 1;\n```"],
    ["tables", "| A | B |\n| --- | --- |\n| 1 | 2 |"],
    ["nested lists", "- one\n  - nested\n- two"],
    ["ordered lists", "1. first\n2. second"],
    ["blockquotes", "> quoted *text*"],
    ["links", "A [link](https://owinz.io/writing/) here."],
    ["inline code and strong", "Use `pnpm dev` **now**."],
    ["horizontal rules", "Above\n\n---\n\nBelow"],
    ["headings at every level", "# One\n\n## Two\n\n### Three"],
  ])("keeps %s", async (_, md) => {
    expect(await rendered(roundTrip(md))).toBe(await rendered(md));
  });
});
