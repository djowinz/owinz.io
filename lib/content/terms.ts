// Categories and tags (the `terms` table) as the content layer reads them.
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db";
import { postTags, terms, type TermRow } from "../db/schema";
import type { TermRef } from "./types";

export type Collection = TermRow["collection"];

/** A post's tag ids, in the author's order. */
export async function postTagIds(db: Db, postId: string): Promise<string[]> {
  const rows = await db
    .select({ id: postTags.termId })
    .from(postTags)
    .where(eq(postTags.postId, postId))
    .orderBy(asc(postTags.position));
  return rows.map((r) => r.id);
}

/** Tag ids for several posts at once. */
export async function postsTagIds(db: Db, postIds: string[]): Promise<Map<string, string[]>> {
  const byPost = new Map<string, string[]>();
  if (postIds.length === 0) return byPost;
  const rows = await db
    .select()
    .from(postTags)
    .where(inArray(postTags.postId, postIds))
    .orderBy(asc(postTags.position));
  for (const row of rows) byPost.set(row.postId, [...(byPost.get(row.postId) ?? []), row.termId]);
  return byPost;
}

/** Every term of a collection, by id. */
export async function termsById(db: Db, collection: Collection): Promise<Map<string, TermRow>> {
  const rows = await db.select().from(terms).where(eq(terms.collection, collection));
  return new Map(rows.map((t) => [t.id, t]));
}

export function listTerms(db: Db, collection: Collection, kind: TermRow["kind"]): Promise<TermRow[]> {
  return db
    .select()
    .from(terms)
    .where(and(eq(terms.collection, collection), eq(terms.kind, kind)))
    .orderBy(asc(terms.sortOrder), asc(terms.name));
}

export const toRef = (term: Pick<TermRow, "name" | "slug">): TermRef => ({ name: term.name, slug: term.slug });

/** Resolves ids to refs, dropping any that no longer exist. */
export function resolveRefs(ids: readonly string[] | undefined, byId: Map<string, TermRow>): TermRef[] {
  return (ids ?? []).flatMap((id) => {
    const term = byId.get(id);
    return term ? [toRef(term)] : [];
  });
}
