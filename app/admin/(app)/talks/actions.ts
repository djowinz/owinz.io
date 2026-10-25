"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { CONTENT_TAGS } from "@/lib/content/tags";
import { getDb } from "@/lib/db";
import { ForbiddenError } from "@/lib/cms/permissions";
import {
  checkTalk,
  createTalk,
  deleteTalk,
  publishTalk,
  saveTalk,
  TalkConflictError,
  TalkError,
  unpublishTalk,
} from "@/lib/cms/talks";
import { authorize, getCmsUser, UnauthenticatedError } from "@/lib/cms/session";
import type { TalkCheckResult, TalkInput } from "@/lib/cms/talk-validate";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; conflict?: boolean };

// Every action re-authenticates and checks the role (inside lib/cms/talks);
// what the editor shows or hides is not the protection.
async function attempt<T extends object>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    if (err instanceof TalkConflictError) return { ok: false, error: err.message, conflict: true };
    if (err instanceof TalkError || err instanceof UnauthenticatedError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: "Your role doesn't allow that." };
    throw err;
  }
}

/** /talks/, the sitemap, and llms.txt all read talks under one tag. */
function refreshSite() {
  updateTag(CONTENT_TAGS.talks);
}

async function requireUser() {
  const user = await getCmsUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

export async function createTalkAction(): Promise<void> {
  const actor = await authorize("create");
  const talk = await createTalk(getDb(), actor);
  redirect(`/admin/talks/${talk.id}/`);
}

export async function saveTalkAction(id: string, input: TalkInput, baseUpdatedAt: string, autoSlug = false) {
  return attempt(async () => {
    const { talk, changed, live } = await saveTalk(getDb(), await requireUser(), id, input, new Date(baseUpdatedAt), {
      autoSlug,
    });
    // No drafts for talks: a change to a published one is a change to the site.
    if (changed && live) refreshSite();
    return { updatedAt: talk.updatedAt.toISOString(), slug: talk.slug, live };
  });
}

export async function checkTalkAction(id: string): Promise<TalkCheckResult> {
  if (!(await getCmsUser())) throw new UnauthenticatedError();
  return checkTalk(getDb(), id);
}

export async function publishTalkAction(id: string) {
  return attempt(async () => {
    const talk = await publishTalk(getDb(), await requireUser(), id);
    refreshSite();
    return { updatedAt: talk.updatedAt.toISOString() };
  });
}

export async function unpublishTalkAction(id: string) {
  return attempt(async () => {
    const talk = await unpublishTalk(getDb(), await requireUser(), id);
    refreshSite();
    return { updatedAt: talk.updatedAt.toISOString() };
  });
}

export async function deleteTalkAction(id: string) {
  const result = await attempt(async () => {
    const { wasLive } = await deleteTalk(getDb(), await requireUser(), id);
    if (wasLive) refreshSite();
    return {};
  });
  if (result.ok) redirect("/admin/talks/");
  return result;
}
