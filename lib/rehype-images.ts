// Rehype plugin for article images:
//   - a paragraph holding only an image becomes a <figure>, and the Markdown
//     title (`![alt](photo.jpg "Caption")`) becomes its <figcaption>
//   - `photo.jpg#left` / `photo.jpg#right` floats the image so text wraps
//     around it, newspaper-style
//   - every image is lazy-loaded
//   - photos next to a folder-style post get their published URL and their
//     shipped width/height, so the page doesn't shift as they load
import path from "path";
import type { Element, Root } from "hast";
import { SKIP, visit } from "unist-util-visit";
import { shippedImageSize } from "./images";

export interface ArticleImageOptions {
  /** Folder of a folder-style post; relative image paths resolve here. */
  dir?: string;
  /** Public URL prefix for the post's photos, e.g. "/writing/my-post". */
  baseUrl?: string;
  /** Collects the file names of the local photos the post references. */
  used?: Set<string>;
}

/** A path relative to the post (no scheme, not root-relative, not a fragment). */
export function isLocalImage(src: string): boolean {
  return !/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(src);
}

export const PLACEMENTS = ["left", "right"] as const;
export type Placement = (typeof PLACEMENTS)[number];

/** Splits `photo.jpg#right` into the path and its placement. */
export function splitPlacement(src: string): { path: string; placement?: Placement } {
  const match = src.match(/^(.*)#(left|right)$/);
  return match ? { path: match[1], placement: match[2] as Placement } : { path: src };
}

function element(
  tagName: string,
  children: Element["children"],
  properties: Element["properties"] = {},
): Element {
  return { type: "element", tagName, properties, children };
}

export function rehypeArticleImages(options: ArticleImageOptions = {}) {
  return async (tree: Root) => {
    visit(tree, "element", (node, index, parent) => {
      if (node.tagName !== "p" || !parent || index === undefined) return;
      const content = node.children.filter(
        (child) => !(child.type === "text" && !child.value.trim()),
      );
      const img = content[0];
      if (content.length !== 1 || img.type !== "element" || img.tagName !== "img") return;

      const caption = img.properties.title;
      delete img.properties.title;
      const { placement } = splitPlacement(String(img.properties.src ?? ""));
      parent.children[index] = element(
        "figure",
        [img, ...(caption ? [element("figcaption", [{ type: "text", value: String(caption) }])] : [])],
        placement ? { className: [`align-${placement}`] } : {},
      );
      return SKIP;
    });

    const sizing: Promise<void>[] = [];
    visit(tree, "element", (node, _index, parent) => {
      if (node.tagName !== "img") return;
      node.properties.loading = "lazy";
      node.properties.decoding = "async";

      // Placement belongs to the figure; an inline image carries it itself.
      const { path: src, placement } = splitPlacement(String(node.properties.src ?? ""));
      node.properties.src = src;
      if (placement && parent?.type === "element" && parent.tagName !== "figure") {
        node.properties.className = [`align-${placement}`];
      }

      const { dir, baseUrl, used } = options;
      if (!dir || !baseUrl || !isLocalImage(src)) return;
      const name = decodeURIComponent(src.replace(/^\.\//, ""));
      // Only files directly inside the post folder are published.
      if (name.includes("/")) return;

      used?.add(name);
      node.properties.src = `${baseUrl}/${encodeURIComponent(name)}`;
      sizing.push(
        shippedImageSize(path.join(dir, name)).then((size) => {
          if (size) Object.assign(node.properties, size);
        }),
      );
    });
    await Promise.all(sizing);
  };
}
