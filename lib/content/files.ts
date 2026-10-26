// Markdown-file content source: `<slug>.md` files and `<slug>/index.md`
// folders with photos beside them. The site reads from the database; this
// source feeds the one-time import (scripts/import-content.ts) and the tests.
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { normalizeDate } from "../dates";
import { slugify } from "../cms/validate";
import { shippedImageSize } from "../images";
import {
  buildProject,
  buildWritingPost,
  newestFirst,
  recentPosts,
  recentProjects,
  splitTalks,
  type ProjectSource,
  type TalkSource,
  type WritingSource,
} from "./render";
import type { ContentType, ProjectPost, RecentPost, RecentProject, Talk, WritingPost } from "./types";

export const CONTENT_DIR = path.join(process.cwd(), "content");
const DIRS = {
  writing: path.join(CONTENT_DIR, "writing"),
  projects: path.join(CONTENT_DIR, "projects"),
  talks: path.join(CONTENT_DIR, "talks"),
};

export interface MarkdownEntry {
  slug: string;
  file: string;
  /** Set for folder-style entries (<slug>/index.md), which can hold photos. */
  folder?: string;
}

/** Entries in a collection: `<slug>.md` files and `<slug>/index.md` folders. */
export function markdownEntries(dir: string): MarkdownEntry[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      return [{ slug: entry.name.replace(/\.md$/, ""), file: path.join(dir, entry.name) }];
    }
    const folder = path.join(dir, entry.name);
    const index = path.join(folder, "index.md");
    if (entry.isDirectory() && fs.existsSync(index)) {
      return [{ slug: entry.name, file: index, folder }];
    }
    return [];
  });
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}

function read(entry: MarkdownEntry) {
  return matter(fs.readFileSync(entry.file, "utf8"));
}

export function writingSource(entry: MarkdownEntry): WritingSource {
  const { data, content } = read(entry);
  return {
    slug: entry.slug,
    title: data.title || "Untitled",
    excerpt: data.excerpt || "",
    date: normalizeDate(data.date),
    updated: normalizeDate(data.updated) || null,
    category: typeof data.category === "string" && data.category.trim()
      ? { name: data.category.trim(), slug: slugify(data.category) }
      : null,
    tags: stringList(data.tags).map((name) => ({ name, slug: slugify(name) })),
    byline: typeof data.author === "string" ? data.author : null,
    body: content,
  };
}

/** Photos resolve to files beside a folder-style post or project. */
function folderResolver(entry: MarkdownEntry, collection: "writing" | "projects" = "writing") {
  const { folder } = entry;
  if (!folder) return undefined;
  return async (name: string) => {
    const file = path.join(folder, name);
    if (!fs.existsSync(file)) return undefined;
    return {
      src: `/${collection}/${entry.slug}/${encodeURIComponent(name)}`,
      ...(await shippedImageSize(file)),
    };
  };
}

/** A project file rendered, with photos beside a folder-style project. */
export function parseProject(entry: MarkdownEntry): Promise<ProjectPost> {
  return buildProject(projectSource(entry), folderResolver(entry, "projects"));
}

export function parseWriting(entry: MarkdownEntry): Promise<WritingPost> {
  return buildWritingPost(writingSource(entry), folderResolver(entry));
}

export async function getWritingPosts(dir: string = DIRS.writing): Promise<WritingPost[]> {
  const posts = await Promise.all(markdownEntries(dir).map(parseWriting));
  return posts.sort(newestFirst);
}

export async function getWritingPost(
  slug: string,
  dir: string = DIRS.writing,
): Promise<WritingPost | null> {
  const entry = markdownEntries(dir).find((e) => e.slug === slug);
  return entry ? parseWriting(entry) : null;
}

export function projectSource(entry: MarkdownEntry): ProjectSource {
  const { data, content } = read(entry);
  return {
    slug: entry.slug,
    title: data.title || "Untitled",
    description: data.description || "",
    purpose: data.purpose || "",
    challenge: data.challenge || "",
    technologies: stringList(data.technologies).map((name) => ({ name, slug: slugify(name) })),
    category: typeof data.category === "string" && data.category.trim()
      ? { name: data.category.trim(), slug: slugify(data.category) }
      : null,
    role: data.role ?? null,
    status: data.status ?? null,
    platform: data.platform ?? null,
    order: typeof data.order === "number" ? data.order : 0,
    launchDate: normalizeDate(data.launchDate) || null,
    updated: normalizeDate(data.updated) || null,
    liveUrl: data.liveUrl ?? null,
    sourceUrl: data.sourceUrl ?? null,
    image: data.image ?? null,
    body: content,
  };
}

export async function getProjects(dir: string = DIRS.projects): Promise<ProjectPost[]> {
  const projects = await Promise.all(markdownEntries(dir).map(parseProject));
  return projects.sort((a, b) => a.order - b.order);
}

export async function getProject(
  slug: string,
  dir: string = DIRS.projects,
): Promise<ProjectPost | null> {
  const entry = markdownEntries(dir).find((e) => e.slug === slug);
  return entry ? parseProject(entry) : null;
}

export function talkSource(entry: MarkdownEntry): TalkSource {
  const { data } = read(entry);
  const links = Object.entries((data.links ?? {}) as Record<string, string>).map(
    ([key, url]) => ({ label: key.charAt(0).toUpperCase() + key.slice(1), url }),
  );
  return {
    slug: entry.slug,
    title: data.title || "Untitled",
    date: normalizeDate(data.date),
    venue: data.venue,
    format: data.format,
    status: data.status,
    upcoming: typeof data.upcoming === "boolean" ? data.upcoming : null,
    links,
  };
}

export async function getTalks(
  now: Date = new Date(),
  dir: string = DIRS.talks,
): Promise<{ upcoming: Talk[]; past: Talk[] }> {
  return splitTalks(markdownEntries(dir).map(talkSource), now);
}

export async function getRecentContent(
  limit: number,
  content: ContentType,
  dir: string = DIRS[content],
): Promise<RecentPost[] | RecentProject[]> {
  return content === "writing"
    ? recentPosts(await getWritingPosts(dir), limit)
    : recentProjects(await getProjects(dir), limit);
}
