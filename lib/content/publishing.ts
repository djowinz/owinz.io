// Publishing posts and projects: the working draft is snapshotted into a
// "published" revision and the row points the site at it. Callers check
// permissions (lib/cms/permissions.ts) and refresh cache tags.
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { posts, projects } from "../db/schema";
import { postSnapshot, projectSnapshot, saveRevision } from "./revisions";
import { postTagIds, projectTagIds } from "./terms";

export class NotFoundError extends Error {}

export async function publishPost(db: Db, postId: string, userId: string | null = null) {
  const [row] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!row) throw new NotFoundError(`No post ${postId}`);
  const snapshot = postSnapshot(row, await postTagIds(db, postId));
  const { revision } = await saveRevision(db, { postId }, "published", snapshot, userId);
  const [updated] = await db
    .update(posts)
    .set({
      state: "published",
      publishedSlug: row.slug,
      publishedRevisionId: revision!.id,
      firstPublishedAt: sql`coalesce(${posts.firstPublishedAt}, now())`,
      updatedBy: userId,
    })
    .where(eq(posts.id, postId))
    .returning();
  return updated;
}

/** Takes the post off the site; the draft and its history stay. */
export async function unpublishPost(db: Db, postId: string, userId: string | null = null) {
  const [updated] = await db
    .update(posts)
    .set({ state: "draft", publishedSlug: null, updatedBy: userId })
    .where(eq(posts.id, postId))
    .returning();
  if (!updated) throw new NotFoundError(`No post ${postId}`);
  return updated;
}

export async function publishProject(db: Db, projectId: string, userId: string | null = null) {
  const [row] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!row) throw new NotFoundError(`No project ${projectId}`);
  const snapshot = projectSnapshot(row, await projectTagIds(db, projectId));
  const { revision } = await saveRevision(db, { projectId }, "published", snapshot, userId);
  const [updated] = await db
    .update(projects)
    .set({
      state: "published",
      publishedSlug: row.slug,
      publishedRevisionId: revision!.id,
      firstPublishedAt: sql`coalesce(${projects.firstPublishedAt}, now())`,
      updatedBy: userId,
    })
    .where(eq(projects.id, projectId))
    .returning();
  return updated;
}

export async function unpublishProject(db: Db, projectId: string, userId: string | null = null) {
  const [updated] = await db
    .update(projects)
    .set({ state: "draft", publishedSlug: null, updatedBy: userId })
    .where(eq(projects.id, projectId))
    .returning();
  if (!updated) throw new NotFoundError(`No project ${projectId}`);
  return updated;
}
