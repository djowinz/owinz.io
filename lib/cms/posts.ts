// Writing in the CMS: everything the editor does to a post, with the
// permission check for each. Server actions (app/admin/(app)/writing) wrap
// these and refresh the site's cache after publishing changes.
import { and, desc, eq, ne } from "drizzle-orm";
import type { Db } from "../db";
import { assets, posts, revisions, users, type AssetRow, type PostRow, type RevisionRow } from "../db/schema";
import { publishPost, unpublishPost } from "../content/publishing";
import {
  getRevision,
  listRevisions,
  postSnapshot,
  saveRevision,
  snapshotHash,
} from "../content/revisions";
import { assertCan, can, type Actor } from "./permissions";
import { checkPostDraft, checkPostForPublish, localPhotoNames, slugify, type CheckResult, type PostInput } from "./validate";

export class PostError extends Error {}

/** Someone else saved the post after this editor loaded it. */
export class ConflictError extends Error {
  constructor(public by: string | null) {
    super(`${by ?? "Someone"} saved this post after you opened it. Reload to see their changes.`);
  }
}

function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function toInput(row: PostRow): PostInput {
  return {
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    category: row.category,
    tags: row.tags,
    date: row.date,
    updated: row.updated,
    byline: row.byline,
    body: row.body,
  };
}

/** Normalizes editor input: trims, drops empty optional fields, dedupes tags. */
export function cleanInput(input: PostInput): PostInput {
  const opt = (value: string | null) => (value?.trim() ? value.trim() : null);
  return {
    title: input.title.trim(),
    slug: input.slug.trim(),
    excerpt: input.excerpt.trim(),
    category: opt(input.category),
    tags: [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))],
    date: input.date,
    updated: opt(input.updated),
    byline: opt(input.byline),
    body: input.body.replace(/\s+$/, "") + "\n",
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function findPost(db: Db, id: string): Promise<PostRow> {
  if (!UUID.test(id)) throw new PostError("This post no longer exists.");
  const [row] = await db.select().from(posts).where(eq(posts.id, id));
  if (!row) throw new PostError("This post no longer exists.");
  return row;
}

async function uniqueSlug(db: Db, base: string, exceptId?: string): Promise<string> {
  const root = base || "untitled";
  for (let n = 1; ; n++) {
    const slug = n === 1 ? root : `${root}-${n}`;
    const taken = await db
      .select({ id: posts.id })
      .from(posts)
      .where(exceptId ? and(eq(posts.slug, slug), ne(posts.id, exceptId)) : eq(posts.slug, slug));
    if (taken.length === 0) return slug;
  }
}

export async function createPost(db: Db, actor: Actor, title = ""): Promise<PostRow> {
  assertCan(actor, "create");
  const slug = await uniqueSlug(db, slugify(title) || "untitled");
  const [row] = await db
    .insert(posts)
    .values({ slug, title: title.trim(), date: today(), body: "", createdBy: actor.id, updatedBy: actor.id })
    .returning();
  return row;
}

export interface PostListItem {
  id: string;
  title: string;
  slug: string;
  state: "draft" | "published";
  unpublishedChanges: boolean;
  date: string;
  updatedAt: Date;
  updatedBy: string | null;
  canEdit: boolean;
}

export async function listPosts(db: Db, actor: Actor): Promise<PostListItem[]> {
  const rows = await db
    .select({ row: posts, liveHash: revisions.contentHash, editor: users.name })
    .from(posts)
    .leftJoin(revisions, eq(revisions.id, posts.publishedRevisionId))
    .leftJoin(users, eq(users.id, posts.updatedBy))
    .orderBy(desc(posts.updatedAt));
  return rows.map(({ row, liveHash, editor }) => ({
    id: row.id,
    title: row.title || "Untitled",
    slug: row.slug,
    state: row.state,
    unpublishedChanges: row.state === "published" && liveHash !== snapshotHash(postSnapshot(row)),
    date: row.date,
    updatedAt: row.updatedAt,
    updatedBy: editor,
    canEdit: can(actor, "edit", row),
  }));
}

export interface RevisionSummary {
  id: string;
  kind: RevisionRow["kind"];
  createdAt: Date;
  by: string | null;
  live: boolean;
}

export interface PostForEdit {
  post: PostRow;
  photos: AssetRow[];
  revisions: RevisionSummary[];
  unpublishedChanges: boolean;
  permissions: { edit: boolean; publish: boolean; unpublish: boolean; restore: boolean; delete: boolean };
}

export async function getPostForEdit(db: Db, actor: Actor, id: string): Promise<PostForEdit> {
  const post = await findPost(db, id);
  const [photos, history] = await Promise.all([
    db.select().from(assets).where(eq(assets.postId, id)).orderBy(desc(assets.createdAt)),
    db
      .select({ revision: revisions, by: users.name })
      .from(revisions)
      .leftJoin(users, eq(users.id, revisions.createdBy))
      .where(eq(revisions.postId, id))
      .orderBy(desc(revisions.seq)),
  ]);
  const live = history.find((h) => h.revision.id === post.publishedRevisionId)?.revision;
  return {
    post,
    photos,
    revisions: history.map(({ revision, by }) => ({
      id: revision.id,
      kind: revision.kind,
      createdAt: revision.createdAt,
      by,
      live: revision.id === post.publishedRevisionId && post.state === "published",
    })),
    unpublishedChanges: post.state === "published" && live?.contentHash !== snapshotHash(postSnapshot(post)),
    permissions: {
      edit: can(actor, "edit", post),
      publish: can(actor, "publish", post),
      unpublish: can(actor, "unpublish", post),
      restore: can(actor, "restore", post),
      delete: can(actor, "delete", post),
    },
  };
}

export interface SaveResult {
  post: PostRow;
  /** An autosave revision was recorded (false when nothing changed). */
  revisionSaved: boolean;
}

/**
 * Saves the working draft. Never touches what's live. `baseUpdatedAt` is
 * when the editor last loaded or saved; a newer save by someone else is a
 * conflict rather than a silent overwrite.
 */
export async function savePost(
  db: Db,
  actor: Actor,
  id: string,
  raw: PostInput,
  baseUpdatedAt: Date,
  /** The URL is following the title (a new post): take the next free one instead of failing. */
  { autoSlug = false }: { autoSlug?: boolean } = {},
): Promise<SaveResult> {
  const current = await findPost(db, id);
  assertCan(actor, "edit", current);
  if (current.updatedAt.getTime() !== baseUpdatedAt.getTime() && current.updatedBy !== actor.id) {
    const [editor] = current.updatedBy
      ? await db.select({ name: users.name }).from(users).where(eq(users.id, current.updatedBy))
      : [];
    throw new ConflictError(editor?.name ?? null);
  }

  const input = cleanInput(raw);
  const [problem] = checkPostDraft(input);
  if (problem) throw new PostError(problem.message);
  const free = await uniqueSlug(db, input.slug, id);
  if (free !== input.slug) {
    if (!autoSlug || current.publishedRevisionId) {
      throw new PostError(`Another post already uses the URL /writing/${input.slug}/.`);
    }
    input.slug = free;
  }

  const unchanged = snapshotHash(postSnapshot({ ...current, ...input })) === snapshotHash(postSnapshot(current));
  if (unchanged) return { post: current, revisionSaved: false };

  const [post] = await db
    .update(posts)
    .set({ ...input, updatedBy: actor.id })
    .where(eq(posts.id, id))
    .returning();
  const { saved } = await saveRevision(db, { postId: id }, "autosave", postSnapshot(post), actor.id);
  return { post, revisionSaved: saved };
}

export async function photoNames(db: Db, postId: string): Promise<Set<string>> {
  const rows = await db.select({ name: assets.name }).from(assets).where(eq(assets.postId, postId));
  return new Set(rows.map((r) => r.name));
}

export async function checkPost(db: Db, id: string): Promise<CheckResult> {
  const post = await findPost(db, id);
  return checkPostForPublish(toInput(post), await photoNames(db, id));
}

/** Publishes the saved draft. Returns the live slugs before and after (both need refreshing). */
export async function publish(db: Db, actor: Actor, id: string): Promise<{ post: PostRow; previousSlug: string | null }> {
  const current = await findPost(db, id);
  assertCan(actor, "publish", current);
  const { errors } = checkPostForPublish(toInput(current), await photoNames(db, id));
  if (errors.length) throw new PostError(errors.map((e) => e.message).join(" "));
  const post = await publishPost(db, id, actor.id);
  return { post, previousSlug: current.state === "published" ? current.publishedSlug : null };
}

export async function unpublish(db: Db, actor: Actor, id: string): Promise<PostRow> {
  const current = await findPost(db, id);
  assertCan(actor, "unpublish", current);
  return unpublishPost(db, id, actor.id);
}

/**
 * Copies a revision into the working draft. The current draft is autosaved
 * first, so a restore can itself be undone from the history.
 */
export async function restore(db: Db, actor: Actor, id: string, revisionId: string): Promise<PostRow> {
  const current = await findPost(db, id);
  assertCan(actor, "restore", current);
  const revision = await getRevision(db, { postId: id }, revisionId);
  if (!revision) throw new PostError("That version no longer exists.");
  await saveRevision(db, { postId: id }, "autosave", postSnapshot(current), actor.id);
  const snapshot = revision.snapshot as Partial<PostInput>;
  const input = cleanInput({ ...toInput(current), ...snapshot, tags: snapshot.tags ?? current.tags });
  input.slug = await uniqueSlug(db, input.slug, id); // the old slug may have been taken since
  const [post] = await db.update(posts).set({ ...input, updatedBy: actor.id }).where(eq(posts.id, id)).returning();
  await saveRevision(db, { postId: id }, "autosave", postSnapshot(post), actor.id);
  return post;
}

/** Deletes the post, its history, and its photo records; returns the photos' storage paths to remove. */
export async function deletePost(db: Db, actor: Actor, id: string): Promise<{ blobPathnames: string[]; liveSlug: string | null }> {
  const current = await findPost(db, id);
  assertCan(actor, "delete", current);
  const photos = await db.select({ pathname: assets.blobPathname }).from(assets).where(eq(assets.postId, id));
  // The post points at its live revision; clear that first so the cascade can run.
  await db.update(posts).set({ state: "draft", publishedSlug: null, publishedRevisionId: null }).where(eq(posts.id, id));
  await db.delete(posts).where(eq(posts.id, id));
  return { blobPathnames: photos.map((p) => p.pathname), liveSlug: current.state === "published" ? current.publishedSlug : null };
}

const PHOTO_NAME = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*\.(jpe?g|png|webp|avif|gif|svg)$/;

/** "IMG 0042.JPG" → "img-0042.jpg" */
export function photoFileName(original: string): string {
  const dot = original.lastIndexOf(".");
  const ext = (dot >= 0 ? original.slice(dot + 1) : "jpg").toLowerCase().replace("jpeg", "jpg");
  const base = slugify(dot >= 0 ? original.slice(0, dot) : original) || "photo";
  return `${base}.${ext}`;
}

/** Checked before an upload is processed and stored. */
export async function assertCanEditPost(db: Db, actor: Actor, postId: string): Promise<void> {
  assertCan(actor, "edit", await findPost(db, postId));
}

/** Records an uploaded photo; a photo with the same name is replaced. Returns the replaced file's storage path. */
export async function attachPhoto(
  db: Db,
  actor: Actor,
  postId: string,
  photo: Omit<typeof assets.$inferInsert, "postId" | "projectId">,
): Promise<{ asset: AssetRow; replacedPathname: string | null }> {
  const post = await findPost(db, postId);
  assertCan(actor, "edit", post);
  if (!PHOTO_NAME.test(photo.name)) throw new PostError(`"${photo.name}" isn't a valid photo name.`);
  const [existing] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.postId, postId), eq(assets.name, photo.name)));
  const [asset] = await db
    .insert(assets)
    .values({ ...photo, postId })
    .onConflictDoUpdate({ target: [assets.postId, assets.name], set: { ...photo, updatedAt: new Date() } })
    .returning();
  return { asset, replacedPathname: existing?.blobPathname ?? null };
}

/** Removes a photo unless the live version shows it. Returns its storage path to delete. */
export async function detachPhoto(db: Db, actor: Actor, postId: string, name: string): Promise<string | null> {
  const post = await findPost(db, postId);
  assertCan(actor, "edit", post);
  if (post.state === "published" && post.publishedRevisionId) {
    const [live] = await db.select().from(revisions).where(eq(revisions.id, post.publishedRevisionId));
    const liveBody = String((live?.snapshot as { body?: string })?.body ?? "");
    if (localPhotoNames(liveBody).includes(name)) {
      throw new PostError(`The live version shows ${name}. Publish a version without it first.`);
    }
  }
  const [removed] = await db
    .delete(assets)
    .where(and(eq(assets.postId, postId), eq(assets.name, name)))
    .returning();
  return removed?.blobPathname ?? null;
}

/** Revisions for the history panel. */
export function postRevisions(db: Db, id: string) {
  return listRevisions(db, { postId: id });
}
