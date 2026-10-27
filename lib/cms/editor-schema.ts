// The rich-text editor's document model, shared by the browser editor and
// the round-trip tests. Every node here reads and writes Markdown, which
// stays the stored format: what the editor saves is what the site renders.
import type { AnyExtension, JSONContent, NodeViewRenderer } from "@tiptap/core";
import CodeBlock from "@tiptap/extension-code-block";
import Image from "@tiptap/extension-image";
import { BulletList, OrderedList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";

export interface EditorSchemaOptions {
  /** Maps an image's Markdown src (e.g. "harbor.jpg#right") to a URL the editor can display. */
  displaySrc?: (src: string) => string;
  /** Draws code blocks in the browser editor (chart blocks as charts). Omitted in tests. */
  codeBlockView?: NodeViewRenderer;
}

/** A chart block: an ordinary code block with language "chart", saved as a ```chart fence. */
export function chartNode(source: string): JSONContent {
  return { type: "codeBlock", attrs: { language: "chart" }, content: [{ type: "text", text: source }] };
}

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
      // Re-added below, so the browser editor can give it a node view.
      codeBlock: false,
      link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
    }),
    CodeBlock.extend({ addNodeView: options.codeBlockView ? () => options.codeBlockView! : undefined }),
    keepLooseness(BulletList),
    keepLooseness(OrderedList),
    articleImage(options),
    TableKit.configure({ table: { resizable: false } }),
  ];
}
