import { describe, it, expect } from "vitest";
import path from "path";
import {
  getProjects,
  getRecentContent,
  getTalks,
  getWritingPost,
  getWritingPosts,
} from "../lib/markdown";

const FIXTURE_WRITING = path.join(__dirname, "fixtures", "content", "writing");
const FIXTURE_PROJECTS = path.join(
  __dirname,
  "fixtures",
  "content",
  "projects",
);

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

describe("projects", () => {
  it("exposes factsheet fields and derives year", async () => {
    const projects = await getProjects(FIXTURE_PROJECTS);
    const alpha = projects.find((p) => p.slug === "alpha")!;
    expect(alpha.role).toBe("Solo project");
    expect(alpha.status).toBe("Shipped");
    expect(alpha.platform).toBe("Web");
    expect(alpha.order).toBe(1);
    expect(alpha.year).toBe("2024");
  });

  it("sorts by order and degrades gracefully without optional fields", async () => {
    const projects = await getProjects(FIXTURE_PROJECTS);
    expect(projects.map((p) => p.slug)).toEqual(["alpha", "beta"]);
    const beta = projects[1];
    expect(beta.role).toBeUndefined();
    expect(beta.year).toBe("2023");
  });
});

const FIXTURE_TALKS = path.join(__dirname, "fixtures", "content", "talks");

describe("talks", () => {
  it("partitions upcoming vs past by date", async () => {
    const { upcoming, past } = await getTalks(
      new Date("2026-06-12"),
      FIXTURE_TALKS,
    );
    expect(upcoming.map((t) => t.title)).toEqual(["A Future Talk"]);
    expect(past.map((t) => t.title)).toEqual(["A Past Talk"]);
  });

  it("maps links to labeled artifacts", async () => {
    const { past } = await getTalks(new Date("2026-06-12"), FIXTURE_TALKS);
    expect(past[0].links).toEqual([
      { label: "Slides", url: "https://example.com/slides" },
      { label: "Video", url: "https://example.com/video" },
    ]);
  });

  it("returns empty arrays when the directory is empty or missing", async () => {
    const { upcoming, past } = await getTalks(
      new Date(),
      path.join(FIXTURE_TALKS, "nope"),
    );
    expect(upcoming).toEqual([]);
    expect(past).toEqual([]);
  });
});

describe("minimal frontmatter", () => {
  it("loads a post with only a title without crashing", async () => {
    const post = await getWritingPost("minimal", FIXTURE_WRITING);
    expect(post?.title).toBe("Minimal Post");
    expect(post?.excerpt).toBe("");
  });
});
