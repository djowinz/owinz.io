// What the site reads. Each function is cached indefinitely under its
// collection's tag (lib/content/tags.ts); publishing from the CMS expires
// the tag, and only then does Next.js re-render the pages that used it.
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "../db";
import * as db from "./db";
import { recentPosts, recentProjects } from "./render";
import { CONTENT_TAGS } from "./tags";
import type { ContentType, ProjectPost, RecentPost, RecentProject, Talk, WritingPost } from "./types";

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
