import { headers } from "next/headers";
import { uploadBlob, removeBlobs } from "@/lib/blob";
import { getDb } from "@/lib/db";
import { ForbiddenError } from "@/lib/cms/permissions";
import { assertCanEditPost, attachPhoto, photoFileName, PostError } from "@/lib/cms/posts";
import { assertCanEditProject, attachProjectPhoto, ProjectError } from "@/lib/cms/projects";
import { getCmsUser } from "@/lib/cms/session";
import { IMAGE_TYPES, prepareImage } from "@/lib/images";

// Photo upload for the editor. The browser shrinks photos to 2400px first,
// which keeps uploads well under Vercel's 4.5 MB request limit; the server
// then rotates, resizes, recompresses, and strips metadata (lib/images.ts).
// A photo belongs to a post (form field `postId`) or a project (`projectId`).
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  await headers();
  const user = await getCmsUser();
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });

  const form = await request.formData();
  const projectId = String(form.get("projectId") ?? "");
  const postId = String(form.get("postId") ?? "");
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file received." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "That file is over 4 MB." }, { status: 413 });

  const name = photoFileName(String(form.get("name") || file.name));
  const ext = name.slice(name.lastIndexOf("."));
  if (!(ext in IMAGE_TYPES)) {
    return Response.json({ error: "Use a JPEG, PNG, WebP, AVIF, GIF, or SVG image." }, { status: 415 });
  }

  try {
    const owner = projectId
      ? { check: assertCanEditProject, attach: attachProjectPhoto, id: projectId, folder: "projects" }
      : { check: assertCanEditPost, attach: attachPhoto, id: postId, folder: "writing" };
    await owner.check(getDb(), user, owner.id);
    const photo = await prepareImage(Buffer.from(await file.arrayBuffer()), name);
    const blob = await uploadBlob(`${owner.folder}/${owner.id}/${name}`, photo.data, photo.contentType);
    const { asset, replacedPathname } = await owner.attach(getDb(), user, owner.id, {
      name,
      blobUrl: blob.url,
      blobPathname: blob.pathname,
      contentType: photo.contentType,
      width: photo.width ?? null,
      height: photo.height ?? null,
      bytes: photo.data.length,
    }).catch(async (err) => {
      await removeBlobs([blob.pathname]);
      throw err;
    });
    if (replacedPathname && replacedPathname !== blob.pathname) await removeBlobs([replacedPathname]);
    return Response.json({ id: asset.id, name: asset.name, width: asset.width, height: asset.height });
  } catch (err) {
    if (err instanceof PostError || err instanceof ProjectError) return Response.json({ error: err.message }, { status: 400 });
    if (err instanceof ForbiddenError) {
      return Response.json({ error: `Your role can't edit this ${projectId ? "project" : "post"}.` }, { status: 403 });
    }
    throw err;
  }
}
