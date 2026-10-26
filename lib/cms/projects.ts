// Projects in the CMS: everything the project editor does, with the
// permission check for each. The project counterpart of lib/cms/posts.ts;
// server actions (app/admin/(app)/projects) wrap these and refresh the
// site's cache after publishing changes.
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "../db";
import {
  assets,
  projects,
  projectTags,
  revisions,
  terms,
  users,
  type AssetRow,
  type ProjectRow,
} from "../db/schema";
import { markdownToHtml } from "../content/render";
import { projectsTagIds, projectTagIds } from "../content/terms";
import { publishProject, unpublishProject } from "../content/publishing";
import { getRevision, projectSnapshot, saveRevision, snapshotHash } from "../content/revisions";
import { assertCan, can, type Actor } from "./permissions";
import type { RevisionSummary } from "./posts";
import { localPhotoNames, slugify } from "./validate";
import {
  checkProjectDraft,
  checkProjectForPublish,
  type ProjectCheckResult,
  type ProjectInput,
} from "./validate-project";

export class ProjectError extends Error {}

/** Someone else saved the project after this editor loaded it. */
export class ProjectConflictError extends Error {
  constructor(public by: string | null) {
    super(`${by ?? "Someone"} saved this project after you opened it. Reload to see their changes.`);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function toProjectInput(row: ProjectRow, technologyIds: readonly string[]): ProjectInput {
  return {
    title: row.title,
    slug: row.slug,
    description: row.description,
    purpose: row.purpose,
    challenge: row.challenge,
    categoryId: row.categoryId,
    technologyIds: [...technologyIds],
    role: row.role,
    projectStatus: row.projectStatus,
    platform: row.platform,
    launchDate: row.launchDate,
    updated: row.updated,
    liveUrl: row.liveUrl,
    sourceUrl: row.sourceUrl,
    image: row.image,
    body: row.body,
  };
}

/** Normalizes editor input: trims, drops empty optional fields, dedupes technologies. */
export function cleanProjectInput(input: ProjectInput): ProjectInput {
  const opt = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);
  return {
    title: (input.title ?? "").trim(),
    slug: (input.slug ?? "").trim(),
    description: (input.description ?? "").trim(),
    purpose: (input.purpose ?? "").trim(),
    challenge: (input.challenge ?? "").trim(),
    categoryId: input.categoryId || null,
    technologyIds: [...new Set((input.technologyIds ?? []).filter(Boolean))],
    role: opt(input.role),
    projectStatus: opt(input.projectStatus),
    platform: opt(input.platform),
    launchDate: opt(input.launchDate),
    updated: opt(input.updated),
    liveUrl: opt(input.liveUrl),
    sourceUrl: opt(input.sourceUrl),
    image: opt(input.image),
    body: (input.body ?? "").replace(/\s+$/, "") + "\n",
  };
}

/** The project's draft as editor input (row + its technologies). */
export async function draftProjectInput(db: Db, row: ProjectRow): Promise<ProjectInput> {
  return toProjectInput(row, await projectTagIds(db, row.id));
}

/** Rejects a category or technologies that aren't projects terms of the right kind. */
async function checkTerms(db: Db, input: ProjectInput): Promise<void> {
  const ids = [...input.technologyIds, ...(input.categoryId ? [input.categoryId] : [])];
  if (ids.length === 0) return;
  if (!ids.every((id) => UUID.test(id))) throw new ProjectError("Choose a category and technologies from the list.");
  const found = await db.select().from(terms).where(inArray(terms.id, ids));
  const byId = new Map(found.map((t) => [t.id, t]));
  const category = input.categoryId ? byId.get(input.categoryId) : undefined;
  if (input.categoryId && (category?.kind !== "category" || category.collection !== "projects")) {
    throw new ProjectError("That category no longer exists. Choose another.");
  }
  if (input.technologyIds.some((id) => byId.get(id)?.kind !== "tag" || byId.get(id)?.collection !== "projects")) {
    throw new ProjectError("A technology no longer exists. Remove it and try again.");
  }
}

/** Writes the draft's fields and, if they changed, its technologies. */
async function writeDraft(db: Db, id: string, input: ProjectInput, userId: string, previous: readonly string[]) {
  const { technologyIds, ...fields } = input;
  const [project] = await db.update(projects).set({ ...fields, updatedBy: userId }).where(eq(projects.id, id)).returning();
  if (technologyIds.join() !== previous.join()) {
    await db.delete(projectTags).where(eq(projectTags.projectId, id));
    if (technologyIds.length) {
      await db
        .insert(projectTags)
        .values(technologyIds.map((termId, position) => ({ projectId: id, termId, position })));
    }
  }
  return project;
}

async function findProject(db: Db, id: string): Promise<ProjectRow> {
  if (!UUID.test(id)) throw new ProjectError("This project no longer exists.");
  const [row] = await db.select().from(projects).where(eq(projects.id, id));
  if (!row) throw new ProjectError("This project no longer exists.");
  return row;
}

async function uniqueSlug(db: Db, base: string, exceptId?: string): Promise<string> {
  const root = base || "untitled";
  for (let n = 1; ; n++) {
    const slug = n === 1 ? root : `${root}-${n}`;
    const taken = await db
      .select({ id: projects.id })
      .from(projects)
      .where(exceptId ? and(eq(projects.slug, slug), ne(projects.id, exceptId)) : eq(projects.slug, slug));
    if (taken.length === 0) return slug;
  }
}

/** A new draft, placed last in the /projects order. */
export async function createProject(db: Db, actor: Actor, title = ""): Promise<ProjectRow> {
  assertCan(actor, "create");
  const slug = await uniqueSlug(db, slugify(title) || "untitled");
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${projects.sortOrder}), -1)` }).from(projects);
  const [row] = await db
    .insert(projects)
    .values({ slug, title: title.trim(), body: "", sortOrder: Number(max) + 1, createdBy: actor.id, updatedBy: actor.id })
    .returning();
  return row;
}

export interface ProjectListItem {
  id: string;
  title: string;
  slug: string;
  state: "draft" | "published";
  unpublishedChanges: boolean;
  category: string | null;
  updatedAt: Date;
  updatedBy: string | null;
  canEdit: boolean;
}

/** Every project in /projects display order (drafts included, where they'd appear once published). */
export async function listProjects(db: Db, actor: Actor): Promise<ProjectListItem[]> {
  const rows = await db
    .select({ row: projects, live: revisions.snapshot, editor: users.name, category: terms.name })
    .from(projects)
    .leftJoin(revisions, eq(revisions.id, projects.publishedRevisionId))
    .leftJoin(users, eq(users.id, projects.updatedBy))
    .leftJoin(terms, eq(terms.id, projects.categoryId))
    .orderBy(asc(projects.sortOrder), asc(projects.title));
  const techByProject = await projectsTagIds(db, rows.map((r) => r.row.id));
  return rows.map(({ row, live, editor, category }) => ({
    id: row.id,
    title: row.title || "Untitled",
    slug: row.slug,
    state: row.state,
    unpublishedChanges:
      row.state === "published" &&
      (!live || snapshotHash(live) !== snapshotHash(projectSnapshot(row, techByProject.get(row.id) ?? []))),
    category,
    updatedAt: row.updatedAt,
    updatedBy: editor,
    canEdit: can(actor, "edit", row),
  }));
}

export interface ProjectForEdit {
  project: ProjectRow;
  input: ProjectInput;
  photos: AssetRow[];
  revisions: RevisionSummary[];
  unpublishedChanges: boolean;
  permissions: { edit: boolean; publish: boolean; unpublish: boolean; restore: boolean; delete: boolean };
}

export async function getProjectForEdit(db: Db, actor: Actor, id: string): Promise<ProjectForEdit> {
  const project = await findProject(db, id);
  const [photos, history] = await Promise.all([
    db.select().from(assets).where(eq(assets.projectId, id)).orderBy(desc(assets.createdAt)),
    db
      .select({ revision: revisions, by: users.name })
      .from(revisions)
      .leftJoin(users, eq(users.id, revisions.createdBy))
      .where(eq(revisions.projectId, id))
      .orderBy(desc(revisions.seq)),
  ]);
  const live = history.find((h) => h.revision.id === project.publishedRevisionId)?.revision;
  const input = await draftProjectInput(db, project);
  return {
    project,
    input,
    photos,
    revisions: history.map(({ revision, by }) => ({
      id: revision.id,
      kind: revision.kind,
      createdAt: revision.createdAt,
      by,
      live: revision.id === project.publishedRevisionId && project.state === "published",
    })),
    unpublishedChanges:
      project.state === "published" &&
      (!live || snapshotHash(live.snapshot) !== snapshotHash(projectSnapshot(project, input.technologyIds))),
    permissions: {
      edit: can(actor, "edit", project),
      publish: can(actor, "publish", project),
      unpublish: can(actor, "unpublish", project),
      restore: can(actor, "restore", project),
      delete: can(actor, "delete", project),
    },
  };
}

export interface ProjectSaveResult {
  project: ProjectRow;
  /** An autosave revision was recorded (false when nothing changed). */
  revisionSaved: boolean;
}

/**
 * Saves the working draft. Never touches what's live. `baseUpdatedAt` is
 * when the editor last loaded or saved; a newer save by someone else is a
 * conflict rather than a silent overwrite.
 */
export async function saveProject(
  db: Db,
  actor: Actor,
  id: string,
  raw: ProjectInput,
  baseUpdatedAt: Date,
  /** The URL is following the title (never published): take the next free one instead of failing. */
  { autoSlug = false }: { autoSlug?: boolean } = {},
): Promise<ProjectSaveResult> {
  const current = await findProject(db, id);
  assertCan(actor, "edit", current);
  if (current.updatedAt.getTime() !== baseUpdatedAt.getTime() && current.updatedBy !== actor.id) {
    const [editor] = current.updatedBy
      ? await db.select({ name: users.name }).from(users).where(eq(users.id, current.updatedBy))
      : [];
    throw new ProjectConflictError(editor?.name ?? null);
  }

  const input = cleanProjectInput(raw);
  const [problem] = checkProjectDraft(input);
  if (problem) throw new ProjectError(problem.message);
  await checkTerms(db, input);
  const free = await uniqueSlug(db, input.slug, id);
  if (free !== input.slug) {
    if (!autoSlug || current.publishedRevisionId) {
      throw new ProjectError(`Another project already uses the URL /projects/${input.slug}/.`);
    }
    input.slug = free;
  }

  const currentTechIds = await projectTagIds(db, id);
  const next = projectSnapshot({ ...current, ...input }, input.technologyIds);
  if (snapshotHash(next) === snapshotHash(projectSnapshot(current, currentTechIds))) {
    return { project: current, revisionSaved: false };
  }

  const project = await writeDraft(db, id, input, actor.id, currentTechIds);
  const { saved } = await saveRevision(db, { projectId: id }, "autosave", projectSnapshot(project, input.technologyIds), actor.id);
  return { project, revisionSaved: saved };
}

export async function projectPhotoNames(db: Db, projectId: string): Promise<Set<string>> {
  const rows = await db.select({ name: assets.name }).from(assets).where(eq(assets.projectId, projectId));
  return new Set(rows.map((r) => r.name));
}

export async function checkProject(db: Db, id: string): Promise<ProjectCheckResult> {
  const project = await findProject(db, id);
  return checkProjectForPublish(await draftProjectInput(db, project), await projectPhotoNames(db, id));
}

/** Publishes the saved draft. Returns the live slug before (it needs refreshing too). */
export async function publish(db: Db, actor: Actor, id: string): Promise<{ project: ProjectRow; previousSlug: string | null }> {
  const current = await findProject(db, id);
  assertCan(actor, "publish", current);
  const { errors } = checkProjectForPublish(await draftProjectInput(db, current), await projectPhotoNames(db, id));
  if (errors.length) throw new ProjectError(errors.map((e) => e.message).join(" "));
  const project = await publishProject(db, id, actor.id);
  return { project, previousSlug: current.state === "published" ? current.publishedSlug : null };
}

export async function unpublish(db: Db, actor: Actor, id: string): Promise<ProjectRow> {
  const current = await findProject(db, id);
  assertCan(actor, "unpublish", current);
  return unpublishProject(db, id, actor.id);
}

/**
 * Copies a revision into the working draft. The current draft is autosaved
 * first, so a restore can itself be undone from the history.
 */
export async function restore(
  db: Db,
  actor: Actor,
  id: string,
  revisionId: string,
): Promise<{ project: ProjectRow; input: ProjectInput }> {
  const current = await findProject(db, id);
  assertCan(actor, "restore", current);
  const revision = await getRevision(db, { projectId: id }, revisionId);
  if (!revision) throw new ProjectError("That version no longer exists.");
  const currentInput = await draftProjectInput(db, current);
  await saveRevision(db, { projectId: id }, "autosave", projectSnapshot(current, currentInput.technologyIds), actor.id);

  const snapshot = revision.snapshot as Partial<ProjectInput>;
  const input = cleanProjectInput({
    ...currentInput,
    ...snapshot,
    technologyIds: snapshot.technologyIds ?? currentInput.technologyIds,
  });
  input.slug = await uniqueSlug(db, input.slug, id); // the old slug may have been taken since
  // Categories and technologies deleted since that version are dropped, not restored.
  const ids = [...input.technologyIds, ...(input.categoryId ? [input.categoryId] : [])];
  const live = new Map(ids.length ? (await db.select().from(terms).where(inArray(terms.id, ids))).map((t) => [t.id, t]) : []);
  if (input.categoryId && !live.has(input.categoryId)) input.categoryId = null;
  input.technologyIds = input.technologyIds.filter((techId) => live.has(techId));

  const project = await writeDraft(db, id, input, actor.id, currentInput.technologyIds);
  await saveRevision(db, { projectId: id }, "autosave", projectSnapshot(project, input.technologyIds), actor.id);
  return { project, input };
}

/** Deletes the project, its history, and its photo records; returns the photos' storage paths to remove. */
export async function deleteProject(
  db: Db,
  actor: Actor,
  id: string,
): Promise<{ blobPathnames: string[]; liveSlug: string | null }> {
  const current = await findProject(db, id);
  assertCan(actor, "delete", current);
  const photos = await db.select({ pathname: assets.blobPathname }).from(assets).where(eq(assets.projectId, id));
  // The project points at its live revision; clear that first so the cascade can run.
  await db
    .update(projects)
    .set({ state: "draft", publishedSlug: null, publishedRevisionId: null })
    .where(eq(projects.id, id));
  await db.delete(projects).where(eq(projects.id, id));
  return {
    blobPathnames: photos.map((p) => p.pathname),
    liveSlug: current.state === "published" ? current.publishedSlug : null,
  };
}

/**
 * Saves the /projects display order: `ids` is every project, first to last.
 * Applies to the live site at once; it isn't part of any version.
 */
export async function reorderProjects(db: Db, actor: Actor, ids: string[]): Promise<void> {
  assertCan(actor, "reorder");
  const all = await db.select({ id: projects.id }).from(projects);
  const known = new Set(all.map((p) => p.id));
  if (ids.length !== known.size || new Set(ids).size !== ids.length || !ids.every((id) => known.has(id))) {
    throw new ProjectError("The projects changed while you were reordering. Reload and try again.");
  }
  // updated_at stays put: the order isn't an edit, and bumping it would make
  // anyone with the project open hit a save conflict.
  for (const [sortOrder, id] of ids.entries()) {
    await db
      .update(projects)
      .set({ sortOrder, updatedAt: sql`${projects.updatedAt}` })
      .where(eq(projects.id, id));
  }
}

/** Moves one project up (-1) or down (+1) in the display order. */
export async function moveProject(db: Db, actor: Actor, id: string, by: -1 | 1): Promise<void> {
  assertCan(actor, "reorder");
  const ordered = await db
    .select({ id: projects.id })
    .from(projects)
    .orderBy(asc(projects.sortOrder), asc(projects.title));
  const ids = ordered.map((p) => p.id);
  const from = ids.indexOf(id);
  if (from === -1) throw new ProjectError("This project no longer exists.");
  const to = from + by;
  if (to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  await reorderProjects(db, actor, ids);
}

/** Checked before an upload is processed and stored. */
export async function assertCanEditProject(db: Db, actor: Actor, projectId: string): Promise<void> {
  assertCan(actor, "edit", await findProject(db, projectId));
}

const PHOTO_NAME = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*\.(jpe?g|png|webp|avif|gif|svg)$/;

/** Records an uploaded photo; a photo with the same name is replaced. Returns the replaced file's storage path. */
export async function attachProjectPhoto(
  db: Db,
  actor: Actor,
  projectId: string,
  photo: Omit<typeof assets.$inferInsert, "postId" | "projectId">,
): Promise<{ asset: AssetRow; replacedPathname: string | null }> {
  const project = await findProject(db, projectId);
  assertCan(actor, "edit", project);
  if (!PHOTO_NAME.test(photo.name)) throw new ProjectError(`"${photo.name}" isn't a valid photo name.`);
  const [existing] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.projectId, projectId), eq(assets.name, photo.name)));
  const [asset] = await db
    .insert(assets)
    .values({ ...photo, projectId })
    .onConflictDoUpdate({ target: [assets.projectId, assets.name], set: { ...photo, updatedAt: new Date() } })
    .returning();
  return { asset, replacedPathname: existing?.blobPathname ?? null };
}

/** Removes a photo unless the live version shows it (in the text or as the cover). Returns its storage path to delete. */
export async function detachProjectPhoto(db: Db, actor: Actor, projectId: string, name: string): Promise<string | null> {
  const project = await findProject(db, projectId);
  assertCan(actor, "edit", project);
  if (project.state === "published" && project.publishedRevisionId) {
    const [live] = await db.select().from(revisions).where(eq(revisions.id, project.publishedRevisionId));
    const snapshot = (live?.snapshot ?? {}) as { body?: string; image?: string | null };
    if (localPhotoNames(String(snapshot.body ?? "")).includes(name) || snapshot.image === name) {
      throw new ProjectError(`The live version shows ${name}. Publish a version without it first.`);
    }
  }
  const [removed] = await db
    .delete(assets)
    .where(and(eq(assets.projectId, projectId), eq(assets.name, name)))
    .returning();
  return removed?.blobPathname ?? null;
}

/**
 * Renders a draft's case study for the editor preview with the site's own
 * Markdown pipeline; photos point at the signed-in CMS photo route.
 */
export async function renderProjectPreview(db: Db, projectId: string, markdown: string): Promise<string> {
  const rows = UUID.test(projectId) ? await db.select().from(assets).where(eq(assets.projectId, projectId)) : [];
  const byName = new Map(rows.map((row) => [row.name, row]));
  return markdownToHtml(markdown.slice(0, 200_000), {
    resolve: async (name) => {
      const asset = byName.get(name);
      if (!asset) return undefined;
      return {
        src: `/api/cms/photos/${asset.id}/?v=${asset.updatedAt.getTime().toString(36)}`,
        ...(asset.width && asset.height ? { width: asset.width, height: asset.height } : {}),
      };
    },
  });
}
