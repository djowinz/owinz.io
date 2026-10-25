"use server";

import { revalidatePath, updateTag } from "next/cache";
import { CONTENT_TAGS } from "@/lib/content/tags";
import { getDb } from "@/lib/db";
import { ForbiddenError } from "@/lib/cms/permissions";
import { getCmsUser, UnauthenticatedError } from "@/lib/cms/session";
import {
  createTerm,
  deleteTerm,
  mergeTags,
  reorderCategories,
  TaxonomyError,
  updateTerm,
} from "@/lib/cms/taxonomy";

export type TermResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// Each action re-checks the session; permissions are checked in lib/cms/taxonomy.
async function attempt<T extends object>(fn: (actor: NonNullable<Awaited<ReturnType<typeof getCmsUser>>>) => Promise<T>): Promise<TermResult<T>> {
  try {
    const actor = await getCmsUser();
    if (!actor) throw new UnauthenticatedError();
    return { ok: true, ...(await fn(actor)) };
  } catch (err) {
    if (err instanceof TaxonomyError || err instanceof UnauthenticatedError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: "Your role can't change categories and tags." };
    throw err;
  }
}

/** Term names and slugs appear on live pages (filters, article links, category pages). */
function refreshSite() {
  updateTag(CONTENT_TAGS.writing);
  revalidatePath("/admin/taxonomy");
}

export async function createTermAction(kind: "category" | "tag", name: string) {
  return attempt(async (actor) => {
    const term = await createTerm(getDb(), actor, { kind, collection: "writing", name });
    revalidatePath("/admin/taxonomy");
    return { term: { id: term.id, name: term.name, slug: term.slug } };
  });
}

export async function updateTermAction(id: string, patch: { name?: string; slug?: string; description?: string }) {
  return attempt(async (actor) => {
    const term = await updateTerm(getDb(), actor, id, patch);
    refreshSite();
    return { term: { id: term.id, name: term.name, slug: term.slug, description: term.description } };
  });
}

export async function deleteTermAction(id: string) {
  return attempt(async (actor) => {
    await deleteTerm(getDb(), actor, id);
    revalidatePath("/admin/taxonomy");
    return {};
  });
}

export async function mergeTagsAction(fromId: string, intoId: string) {
  return attempt(async (actor) => {
    await mergeTags(getDb(), actor, fromId, intoId);
    refreshSite();
    return {};
  });
}

export async function reorderCategoriesAction(ids: string[]) {
  return attempt(async (actor) => {
    await reorderCategories(getDb(), actor, "writing", ids);
    refreshSite();
    return {};
  });
}
