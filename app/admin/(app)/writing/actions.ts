"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { removeBlobs } from "@/lib/blob";
import { CONTENT_TAGS } from "@/lib/content/tags";
import { getDb } from "@/lib/db";
import { ForbiddenError } from "@/lib/cms/permissions";
import {
  checkPost,
  ConflictError,
  createPost,
  deletePost,
  detachPhoto,
  getPostForEdit,
  PostError,
  publish,
  restore,
  savePost,
  unpublish,
} from "@/lib/cms/posts";
import { renderDraftPreview } from "@/lib/cms/preview";
import { authorize, getCmsUser, UnauthenticatedError } from "@/lib/cms/session";
import type { CheckResult, PostInput } from "@/lib/cms/validate";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; conflict?: boolean };

// Every action re-authenticates and checks the role (inside lib/cms/posts);
// what the editor shows or hides is not the protection.
async function attempt<T extends object>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    if (err instanceof ConflictError) return { ok: false, error: err.message, conflict: true };
    if (err instanceof PostError || err instanceof UnauthenticatedError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: "Your role doesn't allow that." };
    throw err;
  }
}

/** The public pages that show writing: one tag covers them all. */
function refreshSite() {
  updateTag(CONTENT_TAGS.writing);
}

export async function createPostAction(): Promise<void> {
  const actor = await authorize("create");
  const post = await createPost(getDb(), actor);
  redirect(`/admin/writing/${post.id}/`);
}

export async function savePostAction(id: string, input: PostInput, baseUpdatedAt: string, autoSlug = false) {
  return attempt(async () => {
    const { post, revisionSaved } = await savePost(getDb(), await requireUser(), id, input, new Date(baseUpdatedAt), {
      autoSlug,
    });
    return { updatedAt: post.updatedAt.toISOString(), slug: post.slug, revisionSaved };
  });
}

export async function previewAction(id: string, markdown: string): Promise<string> {
  if (!(await getCmsUser())) return "";
  return renderDraftPreview(getDb(), id, markdown);
}

export async function checkAction(id: string): Promise<CheckResult> {
  if (!(await getCmsUser())) throw new UnauthenticatedError();
  return checkPost(getDb(), id);
}

export async function publishAction(id: string) {
  return attempt(async () => {
    const actor = await requireUser();
    const { post } = await publish(getDb(), actor, id);
    refreshSite();
    return { slug: post.publishedSlug };
  });
}

export async function unpublishAction(id: string) {
  return attempt(async () => {
    await unpublish(getDb(), await requireUser(), id);
    refreshSite();
    return {};
  });
}

export async function restoreAction(id: string, revisionId: string) {
  return attempt(async () => {
    const { post, input } = await restore(getDb(), await requireUser(), id, revisionId);
    return { input, updatedAt: post.updatedAt.toISOString() };
  });
}

export async function historyAction(id: string) {
  return attempt(async () => {
    const { revisions, unpublishedChanges, post } = await getPostForEdit(getDb(), await requireUser(), id);
    return {
      revisions: revisions.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      unpublishedChanges,
      state: post.state,
      publishedSlug: post.publishedSlug,
    };
  });
}

export async function deletePostAction(id: string) {
  const result = await attempt(async () => {
    const { blobPathnames, liveSlug } = await deletePost(getDb(), await requireUser(), id);
    await removeBlobs(blobPathnames);
    if (liveSlug) refreshSite();
    return {};
  });
  if (result.ok) redirect("/admin/writing/");
  return result;
}

export async function removePhotoAction(id: string, name: string) {
  return attempt(async () => {
    const pathname = await detachPhoto(getDb(), await requireUser(), id, name);
    if (pathname) await removeBlobs([pathname]);
    return {};
  });
}

async function requireUser() {
  const user = await getCmsUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}
