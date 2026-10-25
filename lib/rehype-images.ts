// Rehype plugin for article images:
//   - a paragraph holding only an image becomes a <figure>, and the Markdown
//     title (`![alt](photo.jpg "Caption")`) becomes its <figcaption>
//   - `photo.jpg#left` / `photo.jpg#right` floats the image so text wraps
//     around it, newspaper-style
//   - every image is lazy-loaded
//   - a post's own photos (referenced by bare file name) get their published
//     URL and width/height from a resolver, so the page doesn't shift as they load
import type { Element, Root } from "hast";
import { SKIP, visit } from "unist-util-visit";

export interface ResolvedImage {
  src: string;
  width?: number;
  height?: number;
}

/** Looks up a post's own photo by file name; undefined when it doesn't exist. */
export type ImageResolver = (name: string) => Promise<ResolvedImage | undefined>;

export interface ArticleImageOptions {
  resolve?: ImageResolver;
  /** Collects the file names of the local photos that resolved. */
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

      const { resolve, used } = options;
      if (!resolve || !isLocalImage(src)) return;
      const name = decodeURIComponent(src.replace(/^\.\//, ""));
      // A post's photos sit directly beside it; nested paths aren't published.
      if (name.includes("/")) return;

      sizing.push(
        resolve(name).then((image) => {
          if (!image) return;
          used?.add(name);
          Object.assign(node.properties, image);
        }),
      );
    });
    await Promise.all(sizing);
  };
}
