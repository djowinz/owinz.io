"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { removeBlobs } from "@/lib/blob";
import { CONTENT_TAGS } from "@/lib/content/tags";
import { getDb } from "@/lib/db";
import { ForbiddenError } from "@/lib/cms/permissions";
import {
  checkProject,
  createProject,
  deleteProject,
  detachProjectPhoto,
  getProjectForEdit,
  moveProject,
  ProjectConflictError,
  ProjectError,
  publish,
  renderProjectPreview,
  reorderProjects,
  restore,
  saveProject,
  unpublish,
} from "@/lib/cms/projects";
import { authorize, getCmsUser, UnauthenticatedError } from "@/lib/cms/session";
import type { ProjectCheckResult, ProjectInput } from "@/lib/cms/validate-project";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; conflict?: boolean };

// Every action re-authenticates and checks the role (inside lib/cms/projects);
// what the editor shows or hides is not the protection.
async function attempt<T extends object>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    if (err instanceof ProjectConflictError) return { ok: false, error: err.message, conflict: true };
    if (err instanceof ProjectError || err instanceof UnauthenticatedError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: "Your role doesn't allow that." };
    throw err;
  }
}

/** The public pages that show projects (and the home page, sitemap, llms.txt): one tag covers them all. */
function refreshSite() {
  updateTag(CONTENT_TAGS.projects);
}

async function requireUser() {
  const user = await getCmsUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

export async function createProjectAction(): Promise<void> {
  const actor = await authorize("create");
  const project = await createProject(getDb(), actor);
  redirect(`/admin/projects/${project.id}/`);
}

export async function saveProjectAction(id: string, input: ProjectInput, baseUpdatedAt: string, autoSlug = false) {
  return attempt(async () => {
    const { project, revisionSaved } = await saveProject(getDb(), await requireUser(), id, input, new Date(baseUpdatedAt), {
      autoSlug,
    });
    return { updatedAt: project.updatedAt.toISOString(), slug: project.slug, revisionSaved };
  });
}

export async function previewProjectAction(id: string, markdown: string): Promise<string> {
  if (!(await getCmsUser())) return "";
  return renderProjectPreview(getDb(), id, markdown);
}

export async function checkProjectAction(id: string): Promise<ProjectCheckResult> {
  if (!(await getCmsUser())) throw new UnauthenticatedError();
  return checkProject(getDb(), id);
}

export async function publishProjectAction(id: string) {
  return attempt(async () => {
    const { project } = await publish(getDb(), await requireUser(), id);
    refreshSite();
    return { slug: project.publishedSlug };
  });
}

export async function unpublishProjectAction(id: string) {
  return attempt(async () => {
    await unpublish(getDb(), await requireUser(), id);
    refreshSite();
    return {};
  });
}

export async function restoreProjectAction(id: string, revisionId: string) {
  return attempt(async () => {
    const { project, input } = await restore(getDb(), await requireUser(), id, revisionId);
    return { input, updatedAt: project.updatedAt.toISOString() };
  });
}

export async function projectHistoryAction(id: string) {
  return attempt(async () => {
    const { revisions, unpublishedChanges, project } = await getProjectForEdit(getDb(), await requireUser(), id);
    return {
      revisions: revisions.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      unpublishedChanges,
      state: project.state,
      publishedSlug: project.publishedSlug,
    };
  });
}

export async function deleteProjectAction(id: string) {
  const result = await attempt(async () => {
    const { blobPathnames, liveSlug } = await deleteProject(getDb(), await requireUser(), id);
    await removeBlobs(blobPathnames);
    // Only removing a live project changes the site.
    if (liveSlug) refreshSite();
    return {};
  });
  if (result.ok) redirect("/admin/projects/");
  return result;
}

export async function removeProjectPhotoAction(id: string, name: string) {
  return attempt(async () => {
    const pathname = await detachProjectPhoto(getDb(), await requireUser(), id, name);
    if (pathname) await removeBlobs([pathname]);
    return {};
  });
}

/** Saves the /projects display order (every project id, first to last). Applies live at once. */
export async function reorderProjectsAction(ids: string[]) {
  return attempt(async () => {
    await reorderProjects(getDb(), await requireUser(), ids);
    refreshSite();
    revalidatePath("/admin/projects");
    return {};
  });
}

/** Up/down buttons on the project list; a plain form post, so it works without JavaScript. */
export async function moveProjectAction(id: string, by: -1 | 1): Promise<void> {
  const actor = await authorize("reorder");
  await moveProject(getDb(), actor, id, by === -1 ? -1 : 1);
  refreshSite();
  revalidatePath("/admin/projects");
}
