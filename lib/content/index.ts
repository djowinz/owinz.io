// What the site reads. Each function is cached indefinitely under its
// collection's tag (lib/content/tags.ts); publishing from the CMS expires
// the tag, and only then does Next.js re-render the pages that used it.
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "../db";
import * as db from "./db";
import { recentPosts, recentProjects } from "./render";
import { listTerms } from "./terms";
import { CONTENT_TAGS } from "./tags";
import type {
  ContentType,
  ProjectPost,
  RecentPost,
  RecentProject,
  Talk,
  TermSummary,
  WritingPost,
} from "./types";

export * from "./types";

export async function getWritingPosts(): Promise<WritingPost[]> {
  "use cache";
  cacheLife("max");
  cacheTag(CONTENT_TAGS.writing);
  return db.publishedPosts(getDb());
}

export async function getWritingPost(slug: string): Promise<WritingPost | null> {
  "use cache";
  cacheLife("max");
  cacheTag(CONTENT_TAGS.writing);
  return db.publishedPost(getDb(), slug);
}

/** Where a published post's photo lives in Blob; null if the post doesn't show it. */
export async function getWritingPhoto(
  slug: string,
  name: string,
): Promise<{ blobPathname: string; contentType: string } | null> {
  "use cache";
  cacheLife("max");
  cacheTag(CONTENT_TAGS.writing);
  const asset = await db.publishedPostAsset(getDb(), slug, name);
  return asset && { blobPathname: asset.blobPathname, contentType: asset.contentType };
}

/**
 * Writing categories (in their CMS order) and tags (by name) that at least
 * one live post uses, with counts — what the archive filters and the
 * category and tag pages are built from.
 */
export async function getWritingTaxonomy(): Promise<{ categories: TermSummary[]; tags: TermSummary[] }> {
  "use cache";
  cacheLife("max");
  cacheTag(CONTENT_TAGS.writing);
  return writingTaxonomy();
}

/**
 * Everything a category or tag page shows, cached per (kind, slug) like
 * getWritingPost. A shared lookup would let a page for a term created after
 * the build resume with the build's data and render "not found".
 */
export async function getWritingListing(
  kind: "category" | "tag",
  slug: string,
): Promise<{ term: TermSummary; posts: WritingPost[]; categories: TermSummary[]; tags: TermSummary[] } | null> {
  "use cache";
  cacheLife("max");
  cacheTag(CONTENT_TAGS.writing);
  const [posts, { categories, tags }] = await Promise.all([db.publishedPosts(getDb()), writingTaxonomy()]);
  const term = (kind === "category" ? categories : tags).find((t) => t.slug === slug);
  if (!term) return null;
  return {
    term,
    posts: posts.filter((p) =>
      kind === "category" ? p.categoryRef?.slug === slug : p.tagRefs.some((t) => t.slug === slug),
    ),
    categories,
    tags,
  };
}

async function writingTaxonomy(): Promise<{ categories: TermSummary[]; tags: TermSummary[] }> {
  const [posts, categories, tags] = await Promise.all([
    db.publishedPosts(getDb()),
    listTerms(getDb(), "writing", "category"),
    listTerms(getDb(), "writing", "tag"),
  ]);
  const counts = new Map<string, number>();
  const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const post of posts) {
    if (post.categoryRef) bump(`category:${post.categoryRef.slug}`);
    for (const tag of post.tagRefs) bump(`tag:${tag.slug}`);
  }
  const summarize = (kind: string) => (t: { name: string; slug: string; description: string }) => ({
    name: t.name,
    slug: t.slug,
    description: t.description,
    count: counts.get(`${kind}:${t.slug}`) ?? 0,
  });
  return {
    categories: categories.map(summarize("category")).filter((t) => t.count > 0),
    tags: tags
      .map(summarize("tag"))
      .filter((t) => t.count > 0)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function getProjects(): Promise<ProjectPost[]> {
  "use cache";
  cacheLife("max");
  cacheTag(CONTENT_TAGS.projects);
  return db.publishedProjects(getDb());
}

export async function getProject(slug: string): Promise<ProjectPost | null> {
  "use cache";
  cacheLife("max");
  cacheTag(CONTENT_TAGS.projects);
  return db.publishedProject(getDb(), slug);
}

/** Where a published project's photo lives in Blob; null if the project doesn't show it. */
export async function getProjectPhoto(
  slug: string,
  name: string,
): Promise<{ blobPathname: string; contentType: string } | null> {
  "use cache";
  cacheLife("max");
  cacheTag(CONTENT_TAGS.projects);
  const asset = await db.publishedProjectAsset(getDb(), slug, name);
  return asset && { blobPathname: asset.blobPathname, contentType: asset.contentType };
}

/**
 * Project categories (in their CMS order) and technologies (by name) that at
 * least one live project uses, with counts: the /projects filters and the
 * category and technology pages.
 */
export async function getProjectTaxonomy(): Promise<{ categories: TermSummary[]; technologies: TermSummary[] }> {
  "use cache";
  cacheLife("max");
  cacheTag(CONTENT_TAGS.projects);
  return projectTaxonomy(await db.publishedProjects(getDb()));
}

/**
 * Everything a project category or technology page shows, cached per
 * (kind, slug) like getWritingListing, for the same reason: a page for a
 * term created after the build must not resume with the build's data.
 * `projects` is every live project (numbered in display order); the page
 * filters them.
 */
export async function getProjectListing(
  kind: "category" | "technology",
  slug: string,
): Promise<{ term: TermSummary; projects: ProjectPost[]; categories: TermSummary[]; technologies: TermSummary[] } | null> {
  "use cache";
  cacheLife("max");
  cacheTag(CONTENT_TAGS.projects);
  const projects = await db.publishedProjects(getDb());
  const { categories, technologies } = await projectTaxonomy(projects);
  const term = (kind === "category" ? categories : technologies).find((t) => t.slug === slug);
  if (!term) return null;
  return { term, projects, categories, technologies };
}

async function projectTaxonomy(projects: ProjectPost[]): Promise<{ categories: TermSummary[]; technologies: TermSummary[] }> {
  const [categories, technologies] = await Promise.all([
    listTerms(getDb(), "projects", "category"),
    listTerms(getDb(), "projects", "tag"),
  ]);
  const counts = new Map<string, number>();
  const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const project of projects) {
    if (project.categoryRef) bump(`category:${project.categoryRef.slug}`);
    for (const tech of project.technologyRefs) bump(`tag:${tech.slug}`);
  }
  const summarize = (kind: string) => (t: { name: string; slug: string; description: string }) => ({
    name: t.name,
    slug: t.slug,
    description: t.description,
    count: counts.get(`${kind}:${t.slug}`) ?? 0,
  });
  return {
    categories: categories.map(summarize("category")).filter((t) => t.count > 0),
    technologies: technologies
      .map(summarize("tag"))
      .filter((t) => t.count > 0)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Talks move from upcoming to past by date, so this also refreshes daily. */
export async function getTalks(): Promise<{ upcoming: Talk[]; past: Talk[] }> {
  "use cache";
  cacheLife("days");
  cacheTag(CONTENT_TAGS.talks);
  return db.publishedTalks(getDb(), new Date());
}

export async function getRecentContent(
  limit: number,
  content: ContentType,
): Promise<RecentPost[] | RecentProject[]> {
  return content === "writing"
    ? recentPosts(await getWritingPosts(), limit)
    : recentProjects(await getProjects(), limit);
}
