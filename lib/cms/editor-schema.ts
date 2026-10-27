// The rich-text editor's document model, shared by the browser editor and
// the round-trip tests. Every node here reads and writes Markdown, which
// stays the stored format: what the editor saves is what the site renders.
import { Node, type AnyExtension, type JSONContent, type NodeViewRenderer } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { BulletList, OrderedList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";

export interface EditorSchemaOptions {
  /** Maps an image's Markdown src (e.g. "harbor.jpg#right") to a URL the editor can display. */
  displaySrc?: (src: string) => string;
  /** Draws chart blocks in the browser editor. Omitted in tests. */
  chartView?: NodeViewRenderer;
}

/** A chart block as the editor holds it; saved as a ```chart fence around `source`. */
export function chartNode(source: string): JSONContent {
  return { type: "chart", attrs: { source } };
}

/**
 * ```chart blocks are one atom node, so the editor moves, selects, and
 * deletes them as a whole instead of editing their hidden source text. They
 * claim fenced "code" tokens with language chart ahead of codeBlock (higher
 * priority); every other code block falls through to codeBlock unchanged.
 */
export const Chart = Node.create({
  name: "chart",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  // Above codeBlock (100) so its Markdown handler runs first; below paragraph (1000), the default block.
  priority: 101,

  addAttributes() {
    return { source: { default: "", rendered: false } };
  },

  parseHTML() {
    // Pasted or copied chart blocks: a pre > code.language-chart.
    return [
      {
        tag: "pre",
        priority: 60,
        getAttrs: (el) => (el.querySelector("code.language-chart") ? { source: el.textContent ?? "" } : false),
      },
    ];
  },
  renderHTML({ node }) {
    return ["pre", {}, ["code", { class: "language-chart" }, String(node.attrs.source)]];
  },

  markdownTokenName: "code",
  parseMarkdown: (token, helpers) => {
    // Only ``` fences, which is what this writes back; a ~~~chart fence stays a
    // code block here so it saves unchanged (the site still draws it).
    if (!token.raw?.startsWith("```") || token.lang !== "chart") return [];
    return helpers.createNode("chart", { source: token.text ?? "" });
  },
  renderMarkdown: (node) => "```chart\n" + String(node.attrs?.source ?? "") + "\n```",
});

/**
 * Images keep their Markdown src untouched (file name plus #left/#right
 * placement) and the title as the caption; only what the editor displays
 * is mapped to a loadable URL.
 */
export function articleImage({ displaySrc = (src) => src }: EditorSchemaOptions = {}) {
  return Image.extend({
    // Rendered like the site: a figure (floated for #left/#right) with the
    // title as its caption. The caption is edited in the photo panel.
    renderHTML({ HTMLAttributes }) {
      const src = String(HTMLAttributes.src ?? "");
      const placement = src.match(/#(left|right)$/)?.[1];
      const { title, ...attrs } = HTMLAttributes;
      return [
        "figure",
        { class: placement ? `align-${placement}` : undefined },
        ["img", { ...attrs, src: displaySrc(src), "data-src": src }],
        ...(title ? [["figcaption", {}, String(title)]] : []),
      ];
    },
  }).configure({ inline: false, allowBase64: false });
}

/**
 * Lists remember whether they were "loose" (items separated by blank lines,
 * which the site renders with paragraph spacing) so saving doesn't tighten
 * them. TipTap's own list Markdown always writes tight lists.
 */
function keepLooseness<T extends typeof BulletList | typeof OrderedList>(list: T): T {
  return list.extend({
    addAttributes() {
      return { ...this.parent?.(), loose: { default: false, rendered: false, parseHTML: () => false } };
    },
    parseMarkdown(token, helpers) {
      const node = this.parent?.(token, helpers) ?? [];
      if (!node || Array.isArray(node)) return node;
      // TipTap's own ordered-list tokenizer doesn't pass `loose` through,
      // so also look for a blank line between items in the source.
      const loose = Boolean(token.loose) || /\n[ \t]*\n/.test(String(token.raw ?? "").trim());
      return { ...node, attrs: { ...node.attrs, loose } };
    },
    renderMarkdown(node, h) {
      if (!node.content) return "";
      return h.renderChildren(node.content, node.attrs?.loose ? "\n\n" : "\n");
    },
  }) as T;
}

export function editorExtensions(options: EditorSchemaOptions = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      // Markdown has no underline; links open in place, not on click while editing.
      underline: false,
      bulletList: false,
      orderedList: false,
      link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
    }),
    keepLooseness(BulletList),
    keepLooseness(OrderedList),
    articleImage(options),
    options.chartView ? Chart.extend({ addNodeView: () => options.chartView! }) : Chart,
    TableKit.configure({ table: { resizable: false } }),
  ];
}
