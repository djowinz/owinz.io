// Publishing posts and projects: the working draft is snapshotted into a
// "published" revision and the row points the site at it. Callers check
// permissions (lib/cms/permissions.ts) and refresh cache tags.
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { posts, projects } from "../db/schema";
import { postSnapshot, projectSnapshot, saveRevision } from "./revisions";

export class NotFoundError extends Error {}

export async function publishPost(db: Db, postId: string, userId: string | null = null) {
  const [row] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!row) throw new NotFoundError(`No post ${postId}`);
  const { revision } = await saveRevision(db, { postId }, "published", postSnapshot(row), userId);
  const [updated] = await db
    .update(posts)
    .set({ state: "published", publishedSlug: row.slug, publishedRevisionId: revision!.id, updatedBy: userId })
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
  const { revision } = await saveRevision(db, { projectId }, "published", projectSnapshot(row), userId);
  const [updated] = await db
    .update(projects)
    .set({ state: "published", publishedSlug: row.slug, publishedRevisionId: revision!.id, updatedBy: userId })
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
