import { describe, it, expect } from "vitest";
import { getWritingPosts } from "../lib/markdown";

describe("content layer", () => {
  it("loads writing posts from content/writing", async () => {
    const posts = await getWritingPosts();
    expect(posts.length).toBeGreaterThan(0);
    expect(posts[0].title).toBeTruthy();
  });
});
