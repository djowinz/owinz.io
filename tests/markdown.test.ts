import { describe, it, expect } from "vitest";
import path from "path";
import {
  getRecentContent,
  getWritingPost,
  getWritingPosts,
} from "../lib/markdown";

const FIXTURE_WRITING = path.join(__dirname, "fixtures", "content", "writing");

describe("content layer", () => {
  it("loads writing posts from content/writing", async () => {
    const posts = await getWritingPosts();
    expect(posts.length).toBeGreaterThan(0);
    expect(posts[0].title).toBeTruthy();
  });
});

describe("getRecentContent", () => {
  it("returns newest first, undated last, and ignores non-md files", async () => {
    const recent = await getRecentContent(5, "writing", FIXTURE_WRITING);
    // Invalid/missing dates sort last (NaN time treated as -Infinity).
    expect(recent.map((r) => r.title)).toEqual([
      "Newer Post",
      "Older Post",
      "Minimal Post",
    ]);
    expect(recent.some((r) => r.title === "Untitled")).toBe(false); // .txt ignored
  });

  it("respects the limit", async () => {
    const recent = await getRecentContent(1, "writing", FIXTURE_WRITING);
    expect(recent).toHaveLength(1);
  });
});

describe("minimal frontmatter", () => {
  it("loads a post with only a title without crashing", async () => {
    const post = await getWritingPost("minimal", FIXTURE_WRITING);
    expect(post?.title).toBe("Minimal Post");
    expect(post?.excerpt).toBe("");
  });
});
