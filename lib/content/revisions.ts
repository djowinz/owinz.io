// Version history for posts and projects. Each publish stores a snapshot
// (last REVISION_LIMITS.published kept) and the editor's autosaves store one
// only when the content changed (last REVISION_LIMITS.autosave kept).
import { createHash } from "crypto";
import { and, desc, eq, inArray, isNotNull, notInArray, type SQL } from "drizzle-orm";
import type { Db } from "../db";
import {
  posts,
  projects,
  REVISION_LIMITS,
  revisions,
  type PostRow,
  type ProjectRow,
  type RevisionRow,
} from "../db/schema";

export type RevisionKind = keyof typeof REVISION_LIMITS;
export type RevisionOwner = { postId: string } | { projectId: string };
export type Snapshot = Record<string, unknown>;

function ownerFilter(owner: RevisionOwner): SQL {
  return "postId" in owner ? eq(revisions.postId, owner.postId) : eq(revisions.projectId, owner.projectId);
}

/** Canonical JSON: key order never changes the hash. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function snapshotHash(snapshot: Snapshot): string {
  return createHash("sha256").update(canonical(snapshot)).digest("hex");
}

/** Revisions the site is rendering right now; pruning never touches these. */
function liveRevisionIds(db: Db, owner: RevisionOwner) {
  return "postId" in owner
    ? db
        .select({ id: posts.publishedRevisionId })
        .from(posts)
        .where(and(eq(posts.id, owner.postId), isNotNull(posts.publishedRevisionId)))
    : db
        .select({ id: projects.publishedRevisionId })
        .from(projects)
        .where(and(eq(projects.id, owner.projectId), isNotNull(projects.publishedRevisionId)));
}

/**
 * Stores a revision unless it would duplicate the latest one: an autosave is
 * skipped when nothing changed since the last revision of either kind, a
 * publish when nothing changed since the last publish (the existing one is
 * returned). Then prunes that kind down to its limit.
 */
export async function saveRevision(
  db: Db,
  owner: RevisionOwner,
  kind: RevisionKind,
  snapshot: Snapshot,
  userId: string | null = null,
): Promise<{ saved: boolean; revision?: RevisionRow }> {
  const contentHash = snapshotHash(snapshot);
  const [latest] = await db
    .select()
    .from(revisions)
    .where(kind === "autosave" ? ownerFilter(owner) : and(ownerFilter(owner), eq(revisions.kind, kind)))
    .orderBy(desc(revisions.seq))
    .limit(1);
  // Hash the stored snapshot rather than trusting its stored hash: a data
  // migration may have rewritten the snapshot (e.g. names → term ids).
  if (latest && snapshotHash(latest.snapshot) === contentHash) return { saved: false, revision: latest };

  const [revision] = await db
    .insert(revisions)
    .values({ ...owner, kind, snapshot, contentHash, createdBy: userId })
    .returning();

  const keep = db
    .select({ id: revisions.id })
    .from(revisions)
    .where(and(ownerFilter(owner), eq(revisions.kind, kind)))
    .orderBy(desc(revisions.seq))
    .limit(REVISION_LIMITS[kind]);
  await db
    .delete(revisions)
    .where(
      and(
        ownerFilter(owner),
        eq(revisions.kind, kind),
        notInArray(revisions.id, keep),
        notInArray(revisions.id, liveRevisionIds(db, owner)),
      ),
    );

  return { saved: true, revision };
}

/** Newest first; optionally only one kind. */
export function listRevisions(db: Db, owner: RevisionOwner, kind?: RevisionKind): Promise<RevisionRow[]> {
  return db
    .select()
    .from(revisions)
    .where(kind ? and(ownerFilter(owner), eq(revisions.kind, kind)) : ownerFilter(owner))
    .orderBy(desc(revisions.seq));
}

export async function getRevision(
  db: Db,
  owner: RevisionOwner,
  id: string,
): Promise<RevisionRow | undefined> {
  const [row] = await db
    .select()
    .from(revisions)
    .where(and(ownerFilter(owner), inArray(revisions.id, [id])));
  return row;
}

/**
 * The editable fields of a post, as stored in its revisions. Category and
 * tags are stored by id, so renaming one updates every version that uses it.
 */
export function postSnapshot(row: PostRow, tagIds: readonly string[]): Snapshot {
  const { slug, title, excerpt, categoryId, date, updated, byline, body } = row;
  return { slug, title, excerpt, categoryId, tagIds: [...tagIds], date, updated, byline, body };
}

/** The editable fields of a project, as stored in its revisions. */
export function projectSnapshot(row: ProjectRow): Snapshot {
  const {
    slug, title, description, purpose, challenge, technologies, category, role,
    projectStatus, platform, sortOrder, launchDate, updated, liveUrl, sourceUrl, image, body,
  } = row;
  return {
    slug, title, description, purpose, challenge, technologies, category, role,
    projectStatus, platform, sortOrder, launchDate, updated, liveUrl, sourceUrl, image, body,
  };
}
