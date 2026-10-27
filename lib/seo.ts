import type { Metadata } from "next";
import { format } from "date-fns";
import { parseDate } from "./dates";
import { SITE } from "./site";

/** Path with the trailing slash the static export serves (`trailingSlash: true`). */
export function pagePath(path: string): string {
  if (path === "/" || /\.[a-z0-9]+$/i.test(path)) return path;
  return path.endsWith("/") ? path : `${path}/`;
}

export function absoluteUrl(path: string): string {
  return new URL(pagePath(path), SITE.url).toString();
}

/** Frontmatter date ("March 15, 2026", "2026-03-15", …) → "2026-03-15". */
export function isoDate(raw: string | undefined): string | undefined {
  const date = parseDate(raw);
  return date && format(date, "yyyy-MM-dd");
}

/** Plain-text summary of a markdown body, for posts without an excerpt. */
export function summarize(markdown: string, max = 160): string {
  const paragraph =
    // Fences go first: a chart's `---` and CSV are separated by blank lines.
    markdown
      .replace(/```[\s\S]*?```/g, "")
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      // Skip headings, lists, quotes, code, tables, and images.
      .find((block) => block && !/^(#|[-*+] |\d+\. |>|```|\||!\[)/.test(block)) ?? "";
  const text = paragraph
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:.\s—-]+$/, "")}…`;
}

interface PageSeo {
  /** Omit on the home page to use the site title. */
  title?: string;
  description: string;
  path: string;
  /** Social card, e.g. "/writing/foo/og.png"; defaults to the site card. */
  image?: string;
  type?: "website" | "article" | "profile";
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  tags?: string[];
}

/**
 * Complete per-page metadata. Next merges metadata shallowly, so every page
 * restates `openGraph`, `twitter`, and `alternates` in full. Social cards
 * are rendered by the `og.png` route handlers (real .png files in the static
 * export, unlike `opengraph-image.tsx` output, which has no extension).
 */
export function pageMetadata({
  title,
  description,
  path,
  image = "/og.png",
  type = "website",
  publishedTime,
  modifiedTime,
  section,
  tags,
}: PageSeo): Metadata {
  const url = pagePath(path);
  const socialTitle = title ?? SITE.title;
  const card = { url: image, width: 1200, height: 630, alt: socialTitle };
  return {
    // An explicit `title: undefined` would erase the layout's default title.
    ...(title && { title }),
    description,
    keywords: tags?.length ? tags : undefined,
    alternates: {
      canonical: url,
      types: {
        "application/rss+xml": [{ url: "/feed.xml", title: `${SITE.name} — Writing` }],
      },
    },
    openGraph: {
      type,
      url,
      siteName: SITE.name,
      locale: SITE.locale,
      title: socialTitle,
      description,
      images: [card],
      ...(type === "article" && {
        publishedTime,
        modifiedTime: modifiedTime ?? publishedTime,
        authors: [SITE.url],
        section,
        tags,
      }),
    },
    twitter: {
      card: "summary_large_image",
      site: SITE.twitter,
      creator: SITE.twitter,
      title: socialTitle,
      description,
      images: [card],
    },
  };
}
