// Posts as Markdown files with YAML frontmatter, in the same format as
// content/writing (lib/content/files.ts reads it back): the editor's
// "Export .md" download and `pnpm content:export`, whose folders
// `pnpm content:import <dir>` re-imports.
//
// The body is the working draft. `status` records whether the post is live;
// `unpublishedChanges: true` marks a live post whose draft differs from what
// the site shows (re-importing publishes the draft as it is).
import { desc, eq } from "drizzle-orm";
import matter from "gray-matter";
import type { Db } from "../db";
import { assets, posts, revisions, type AssetRow, type PostRow } from "../db/schema";
import { postSnapshot, snapshotHash } from "../content/revisions";
import { postTagIds, termsById } from "../content/terms";

export interface ExportedPost {
  id: string;
  slug: string;
  status: PostRow["state"];
  /** index.md / <slug>.md contents. */
  markdown: string;
  photos: AssetRow[];
}

/** Frontmatter field order matches the README's writing example. */
export async function exportPost(db: Db, row: PostRow): Promise<ExportedPost> {
  const [tagIds, byId, photos] = await Promise.all([
    postTagIds(db, row.id),
    termsById(db, "writing"),
    db.select().from(assets).where(eq(assets.postId, row.id)).orderBy(assets.name),
  ]);
  let unpublishedChanges = false;
  if (row.state === "published" && row.publishedRevisionId) {
    const [live] = await db.select().from(revisions).where(eq(revisions.id, row.publishedRevisionId));
    unpublishedChanges = !live || snapshotHash(live.snapshot) !== snapshotHash(postSnapshot(row, tagIds));
  }

  const data: Record<string, unknown> = {
    title: row.title || "Untitled",
    date: row.date,
    ...(row.updated ? { updated: row.updated } : {}),
    ...(row.excerpt ? { excerpt: row.excerpt } : {}),
    ...(row.categoryId && byId.get(row.categoryId) ? { category: byId.get(row.categoryId)!.name } : {}),
    ...(tagIds.length ? { tags: tagIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!.name] : [])) } : {}),
    ...(row.byline ? { byline: row.byline } : {}),
    status: row.state,
    ...(unpublishedChanges ? { unpublishedChanges: true } : {}),
  };
  const body = row.body.replace(/\s+$/, "");
  return { id: row.id, slug: row.slug, status: row.state, markdown: matter.stringify(body ? `\n${body}\n` : "", data), photos };
}

/** Every post, newest first by last edit. */
export async function exportAllPosts(db: Db): Promise<ExportedPost[]> {
  const rows = await db.select().from(posts).orderBy(desc(posts.updatedAt));
  return Promise.all(rows.map((row) => exportPost(db, row)));
}

export async function exportPostById(db: Db, id: string): Promise<ExportedPost | null> {
  const [row] = await db.select().from(posts).where(eq(posts.id, id));
  return row ? exportPost(db, row) : null;
}
