// Categories and tags in the CMS, for writing and for projects (whose tags
// are shown as "Technologies"). Editors and writers manage them; anyone who
// can create content can add a new tag while editing. Posts and projects
// refer to terms by id (drafts and published versions alike), so renames
// show everywhere at once and deletes are only allowed for unused terms.
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "../db";
import { posts, postTags, projects, projectTags, revisions, terms, type TermRow } from "../db/schema";
import type { Collection } from "../content/terms";
import { assertCan, type Actor } from "./permissions";
import { SLUG, slugify } from "./validate";

export class TaxonomyError extends Error {}

type Kind = TermRow["kind"];

export interface TermUsage extends TermRow {
  /** Drafts using it (the editable rows). */
  drafts: number;
  /** Live posts (or projects) whose published version uses it. */
  live: number;
}

const MAX_NAME = 60;

function cleanName(name: string): string {
  const trimmed = name.replace(/\s+/g, " ").trim();
  if (!trimmed) throw new TaxonomyError("Give it a name.");
  if (trimmed.length > MAX_NAME) throw new TaxonomyError(`Keep names under ${MAX_NAME} characters.`);
  return trimmed;
}

async function find(db: Db, id: string): Promise<TermRow> {
  const [term] = /^[0-9a-f-]{36}$/.test(id) ? await db.select().from(terms).where(eq(terms.id, id)) : [];
  if (!term) throw new TaxonomyError("That category or tag no longer exists.");
  return term;
}

async function freeSlug(db: Db, kind: Kind, collection: Collection, base: string, exceptId?: string): Promise<string> {
  const root = base || "untitled";
  for (let n = 1; ; n++) {
    const slug = n === 1 ? root : `${root}-${n}`;
    const taken = await db
      .select({ id: terms.id })
      .from(terms)
      .where(
        and(
          eq(terms.kind, kind),
          eq(terms.collection, collection),
          eq(terms.slug, slug),
          ...(exceptId ? [ne(terms.id, exceptId)] : []),
        ),
      );
    if (taken.length === 0) return slug;
  }
}

async function byName(db: Db, kind: Kind, collection: Collection, name: string, exceptId?: string) {
  const [term] = await db
    .select()
    .from(terms)
    .where(
      and(
        eq(terms.kind, kind),
        eq(terms.collection, collection),
        sql`lower(${terms.name}) = lower(${name})`,
        ...(exceptId ? [ne(terms.id, exceptId)] : []),
      ),
    );
  return term;
}

/** Categories (in display order) and tags (by name), with how many posts or projects use each. */
export async function listTaxonomy(db: Db, collection: Collection): Promise<{ categories: TermUsage[]; tags: TermUsage[] }> {
  const rows = await db
    .select()
    .from(terms)
    .where(eq(terms.collection, collection))
    .orderBy(asc(terms.sortOrder), asc(terms.name));

  const drafts = new Map<string, number>();
  const live = new Map<string, number>();
  const bump = (map: Map<string, number>, id: unknown) => {
    if (typeof id === "string") map.set(id, (map.get(id) ?? 0) + 1);
  };
  if (collection === "writing") {
    for (const { id } of await db.select({ id: posts.categoryId }).from(posts)) bump(drafts, id);
    for (const { id } of await db.select({ id: postTags.termId }).from(postTags)) bump(drafts, id);
    const snapshots = await db
      .select({ snapshot: revisions.snapshot })
      .from(posts)
      .innerJoin(revisions, eq(revisions.id, posts.publishedRevisionId))
      .where(eq(posts.state, "published"));
    for (const { snapshot } of snapshots) {
      bump(live, snapshot.categoryId);
      for (const id of (snapshot.tagIds as unknown[] | undefined) ?? []) bump(live, id);
    }
  } else {
    for (const { id } of await db.select({ id: projects.categoryId }).from(projects)) bump(drafts, id);
    for (const { id } of await db.select({ id: projectTags.termId }).from(projectTags)) bump(drafts, id);
    const snapshots = await db
      .select({ snapshot: revisions.snapshot })
      .from(projects)
      .innerJoin(revisions, eq(revisions.id, projects.publishedRevisionId))
      .where(eq(projects.state, "published"));
    for (const { snapshot } of snapshots) {
      bump(live, snapshot.categoryId);
      for (const id of (snapshot.technologyIds as unknown[] | undefined) ?? []) bump(live, id);
    }
  }
  const withUsage = (t: TermRow): TermUsage => ({ ...t, drafts: drafts.get(t.id) ?? 0, live: live.get(t.id) ?? 0 });
  return {
    categories: rows.filter((t) => t.kind === "category").map(withUsage),
    tags: rows.filter((t) => t.kind === "tag").sort((a, b) => a.name.localeCompare(b.name)).map(withUsage),
  };
}

/**
 * Creates a category or tag, or returns the existing one with that name
 * (ignoring case) — so adding a tag while editing never duplicates one.
 */
export async function createTerm(
  db: Db,
  actor: Actor,
  input: { kind: Kind; collection: Collection; name: string; description?: string },
): Promise<TermRow> {
  assertCan(actor, input.kind === "category" ? "manageTaxonomy" : "create");
  return ensureTerm(db, input);
}

/** createTerm without the permission check, for system jobs (import, seed). */
export async function ensureTerm(
  db: Db,
  input: { kind: Kind; collection: Collection; name: string; description?: string },
): Promise<TermRow> {
  const name = cleanName(input.name);
  const existing = await byName(db, input.kind, input.collection, name);
  if (existing) return existing;
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${terms.sortOrder}), -1)` })
    .from(terms)
    .where(and(eq(terms.kind, input.kind), eq(terms.collection, input.collection)));
  const [term] = await db
    .insert(terms)
    .values({
      kind: input.kind,
      collection: input.collection,
      name,
      slug: await freeSlug(db, input.kind, input.collection, slugify(name)),
      description: input.description?.trim() ?? "",
      sortOrder: Number(max) + 1,
    })
    .returning();
  return term;
}

/** Renames, re-slugs, or re-describes a term. Live pages show the change once the cache refreshes. */
export async function updateTerm(
  db: Db,
  actor: Actor,
  id: string,
  patch: { name?: string; slug?: string; description?: string },
): Promise<TermRow> {
  assertCan(actor, "manageTaxonomy");
  const term = await find(db, id);
  const name = patch.name === undefined ? term.name : cleanName(patch.name);
  if (await byName(db, term.kind, term.collection, name, id)) {
    throw new TaxonomyError(`There's already a ${term.kind} called "${name}". Merge them instead.`);
  }
  let slug = term.slug;
  if (patch.slug !== undefined && patch.slug !== term.slug) {
    slug = patch.slug.trim();
    if (!SLUG.test(slug)) throw new TaxonomyError("Use lowercase words separated by hyphens for the URL.");
    if ((await freeSlug(db, term.kind, term.collection, slug, id)) !== slug) {
      throw new TaxonomyError(`Another ${term.kind} already uses /${slug}/.`);
    }
  }
  const description = patch.description === undefined ? term.description : patch.description.trim();
  if (description.length > 300) throw new TaxonomyError("Keep descriptions under 300 characters.");
  const [updated] = await db.update(terms).set({ name, slug, description }).where(eq(terms.id, id)).returning();
  return updated;
}

/** Saves the display order of a collection's categories. */
export async function reorderCategories(db: Db, actor: Actor, collection: Collection, ids: string[]): Promise<void> {
  assertCan(actor, "manageTaxonomy");
  const categories = await db
    .select({ id: terms.id })
    .from(terms)
    .where(and(eq(terms.kind, "category"), eq(terms.collection, collection)));
  const known = new Set(categories.map((c) => c.id));
  if (ids.length !== known.size || !ids.every((id) => known.has(id))) {
    throw new TaxonomyError("The categories changed while you were reordering. Reload and try again.");
  }
  for (const [sortOrder, id] of ids.entries()) await db.update(terms).set({ sortOrder }).where(eq(terms.id, id));
}

/** Deletes a term nobody uses, in drafts or live versions. */
export async function deleteTerm(db: Db, actor: Actor, id: string): Promise<void> {
  assertCan(actor, "manageTaxonomy");
  const term = await find(db, id);
  const usage = (await listTaxonomy(db, term.collection))[term.kind === "category" ? "categories" : "tags"].find(
    (t) => t.id === id,
  );
  if (usage && (usage.drafts || usage.live)) {
    const noun = term.collection === "projects" ? "project" : "post";
    const merge = term.collection === "projects" ? "Merge it into another technology" : "Merge it into another tag";
    throw new TaxonomyError(
      `"${term.name}" is still used by ${usage.drafts} draft${usage.drafts === 1 ? "" : "s"} and ${usage.live} live ${noun}${usage.live === 1 ? "" : "s"}. ${term.kind === "tag" ? merge : `Move those ${noun}s to another category`} first.`,
    );
  }
  await db.delete(terms).where(eq(terms.id, id));
}

/**
 * Folds one tag into another: every draft and every saved version (live or
 * not) that used `fromId` uses `intoId` instead, then `fromId` is deleted.
 * Returns the tags' collection (whose pages need refreshing).
 */
export async function mergeTags(db: Db, actor: Actor, fromId: string, intoId: string): Promise<Collection> {
  assertCan(actor, "manageTaxonomy");
  if (fromId === intoId) throw new TaxonomyError("Choose a different tag to merge into.");
  const [from, into] = [await find(db, fromId), await find(db, intoId)];
  if (from.kind !== "tag" || into.kind !== "tag" || from.collection !== into.collection) {
    throw new TaxonomyError("Only tags of the same collection can be merged.");
  }

  if (from.collection === "projects") {
    // Drafts: projects that had both keep one; the rest are repointed.
    const haveInto = (await db.select({ id: projectTags.projectId }).from(projectTags).where(eq(projectTags.termId, intoId))).map((r) => r.id);
    if (haveInto.length) {
      await db.delete(projectTags).where(and(eq(projectTags.termId, fromId), inArray(projectTags.projectId, haveInto)));
    }
    await db.update(projectTags).set({ termId: intoId }).where(eq(projectTags.termId, fromId));
    // Saved versions: replace the id inside snapshot.technologyIds, keeping order and dropping duplicates.
    await db.execute(sql`
      update ${revisions} r set snapshot = jsonb_set(r.snapshot, '{technologyIds}', coalesce((
        select jsonb_agg(to_jsonb(q.id) order by q.ord) from (
          select distinct on (id) id, ord from (
            select case when x.id = ${fromId} then ${intoId} else x.id end as id, x.ord
            from jsonb_array_elements_text(r.snapshot->'technologyIds') with ordinality as x(id, ord)
          ) mapped order by id, ord
        ) q
      ), '[]'::jsonb))
      where r.project_id is not null and r.snapshot->'technologyIds' ? ${fromId}
    `);
    await db.delete(terms).where(eq(terms.id, fromId));
    return "projects";
  }

  // Drafts: posts that had both keep one; the rest are repointed.
  const both = await db
    .select({ postId: postTags.postId })
    .from(postTags)
    .where(eq(postTags.termId, intoId));
  const haveInto = both.map((r) => r.postId);
  if (haveInto.length) {
    await db.delete(postTags).where(and(eq(postTags.termId, fromId), inArray(postTags.postId, haveInto)));
  }
  await db.update(postTags).set({ termId: intoId }).where(eq(postTags.termId, fromId));

  // Saved versions: replace the id inside snapshot.tagIds, keeping order and dropping duplicates.
  await db.execute(sql`
    update ${revisions} r set snapshot = jsonb_set(r.snapshot, '{tagIds}', coalesce((
      select jsonb_agg(to_jsonb(q.id) order by q.ord) from (
        select distinct on (id) id, ord from (
          select case when x.id = ${fromId} then ${intoId} else x.id end as id, x.ord
          from jsonb_array_elements_text(r.snapshot->'tagIds') with ordinality as x(id, ord)
        ) mapped order by id, ord
      ) q
    ), '[]'::jsonb))
    where r.post_id is not null and r.snapshot->'tagIds' ? ${fromId}
  `);
  await db.delete(terms).where(eq(terms.id, fromId));
  return from.collection;
}
