import { describe, expect, it } from "vitest";
import { chartIssues } from "../lib/charts/check";
import { checkPostForPublish, type PostInput } from "../lib/cms/validate";
import { checkProjectForPublish, type ProjectInput } from "../lib/cms/validate-project";

const fence = (src: string) => "```chart\n" + src + "\n```";
const GOOD = fence("type: bar\ntitle: Quarterly\n---\nq,Revenue\nQ1,10\nQ2,12");
const DONUT = fence("type: donut\ntitle: Share\n---\nq,Revenue\nQ1,10");
const body = `Intro.\n\n${GOOD}\n\n${DONUT}\n`;

const post: PostInput = {
  title: "A finished post",
  slug: "a-finished-post",
  excerpt: "An excerpt that is long enough to read well in search results without being cut off.",
  categoryId: null,
  tagIds: [],
  date: "2026-03-15",
  updated: null,
  byline: null,
  body,
};
const project: ProjectInput = {
  title: "Chronicle",
  slug: "chronicle",
  description: "A personal finance tracker that focuses on trends and patterns rather than transaction-level details.",
  purpose: "",
  challenge: "",
  categoryId: null,
  technologyIds: [],
  role: null,
  projectStatus: null,
  platform: null,
  launchDate: "2026-03-15",
  updated: null,
  liveUrl: null,
  sourceUrl: null,
  image: null,
  body,
};

describe("chartIssues", () => {
  it("reports one error for the bad chart, named by position", () => {
    const { errors } = chartIssues(body);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^Chart 2: /);
  });

  it("warns about a chart with no title or caption", () => {
    const { errors, warnings } = chartIssues(fence("type: bar\n---\nq,Revenue\nQ1,10\nQ2,12"));
    expect(errors).toEqual([]);
    expect(warnings).toContain("Chart 1: add a title or caption so readers know what it shows");
  });

  it("warns about negative and crowded pies, named by title", () => {
    const rows = Array.from({ length: 9 }, (_, i) => `S${i},${i === 0 ? -1 : 5}`).join("\n");
    const { warnings } = chartIssues(fence(`type: pie\ntitle: Share\n---\nname,Value\n${rows}`));
    expect(warnings).toContain(`Chart "Share": pie slices can't be negative`);
    expect(warnings).toContain(`Chart "Share": pies read best with 8 slices or fewer`);
  });

  it("warns about very long tables", () => {
    const rows = Array.from({ length: 2001 }, (_, i) => `${i},${i}`).join("\n");
    const { warnings } = chartIssues(fence(`type: line\ntitle: Big\n---\nx,y\n${rows}`));
    expect(warnings).toContain(`Chart "Big": 2001 rows may be slow to draw`);
  });
});

describe("publish checks", () => {
  it("blocks a post with a broken chart", () => {
    const { errors } = checkPostForPublish(post, new Set());
    expect(errors.filter((e) => e.field === "body" && e.message.startsWith("Chart 2:"))).toHaveLength(1);
  });

  it("blocks a project with a broken chart", () => {
    const { errors } = checkProjectForPublish(project, new Set());
    expect(errors.filter((e) => e.field === "body" && e.message.startsWith("Chart 2:"))).toHaveLength(1);
  });
});
