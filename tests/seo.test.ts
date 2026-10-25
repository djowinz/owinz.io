import { describe, it, expect } from "vitest";
import path from "path";
import { absoluteUrl, isoDate, pageMetadata, pagePath, summarize } from "../lib/seo";
import { getWritingPost } from "../lib/content/files";
import { normalizeDate, parseDate } from "../lib/dates";

const FIXTURE_WRITING = path.join(__dirname, "fixtures", "content-seo", "writing");

describe("pagePath / absoluteUrl", () => {
  it("adds the trailing slash the static export serves", () => {
    expect(pagePath("/writing")).toBe("/writing/");
    expect(pagePath("/writing/")).toBe("/writing/");
    expect(pagePath("/")).toBe("/");
    expect(absoluteUrl("/projects/alpha")).toBe("https://owinz.io/projects/alpha/");
  });

  it("leaves file paths alone", () => {
    expect(pagePath("/feed.xml")).toBe("/feed.xml");
    expect(absoluteUrl("/writing/foo/og.png")).toBe("https://owinz.io/writing/foo/og.png");
  });
});

describe("isoDate", () => {
  it("normalizes frontmatter date formats without timezone drift", () => {
    expect(isoDate("March 15, 2026")).toBe("2026-03-15");
    expect(isoDate("2026-03-15")).toBe(isoDate("March 15, 2026"));
  });

  it("keeps the calendar day of unquoted YAML dates (parsed as UTC midnight)", () => {
    expect(normalizeDate(new Date("2026-03-15T00:00:00Z"))).toBe("2026-03-15");
    expect(parseDate("2026-03-15")?.getDate()).toBe(15);
  });

  it("returns undefined for missing or invalid dates", () => {
    expect(isoDate(undefined)).toBeUndefined();
    expect(isoDate("someday")).toBeUndefined();
  });
});

describe("summarize", () => {
  it("uses the first prose paragraph, stripped of markdown", () => {
    const md = "## Heading\n\n- a list\n\nSome **bold** text with [a link](https://x.y).\n\nSecond.";
    expect(summarize(md)).toBe("Some bold text with a link.");
  });

  it("truncates on a word boundary with an ellipsis", () => {
    const summary = summarize("word ".repeat(100), 40);
    expect(summary.length).toBeLessThanOrEqual(40);
    expect(summary).toMatch(/word…$/);
  });
});

describe("pageMetadata", () => {
  it("builds canonical, Open Graph, and Twitter tags for an article", () => {
    const meta = pageMetadata({
      title: "Post",
      description: "About the post.",
      path: "/writing/post",
      image: "/writing/post/og.png",
      type: "article",
      publishedTime: "2026-01-05",
      tags: ["seo"],
    });
    expect(meta.alternates?.canonical).toBe("/writing/post/");
    expect(meta.openGraph).toMatchObject({
      type: "article",
      url: "/writing/post/",
      publishedTime: "2026-01-05",
      modifiedTime: "2026-01-05",
      images: [{ url: "/writing/post/og.png", width: 1200, height: 630 }],
    });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" });
    expect(meta.keywords).toEqual(["seo"]);
  });

  it("omits title entirely so the home page inherits the layout default", () => {
    expect("title" in pageMetadata({ description: "d", path: "/" })).toBe(false);
  });
});

describe("content layer SEO fields", () => {
  it("falls back to a generated description when there is no excerpt", async () => {
    const post = await getWritingPost("tagged", FIXTURE_WRITING);
    expect(post?.excerpt).toBe("");
    expect(post?.description).toBe("The first real paragraph explains everything about tagging.");
  });

  it("reads updated and keeps only string tags", async () => {
    const post = await getWritingPost("tagged", FIXTURE_WRITING);
    expect(post?.updated).toBe("2026-02-10");
    expect(post?.tags).toEqual(["seo", "static sites"]);
    expect(post?.markdown.startsWith("## A heading")).toBe(true);
  });
});

describe("unquoted YAML dates", () => {
  it("are normalized to the authored day", async () => {
    const post = await getWritingPost("tagged", FIXTURE_WRITING);
    expect(post?.date).toBe("2026-01-05");
    expect(isoDate(post?.date)).toBe("2026-01-05");
  });
});
