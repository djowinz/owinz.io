// Writes exported posts (lib/cms/export.ts) as a content folder:
// <dir>/writing/<slug>/index.md plus the post's photos, the layout
// lib/content/files.ts and `pnpm content:import <dir>` read.
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import type { Db } from "../db";
import { exportAllPosts } from "./export";

export type BlobReader = (pathname: string) => Promise<{ stream: ReadableStream<Uint8Array> } | null>;

export async function exportPostsToDir(
  db: Db,
  dir: string,
  read: BlobReader,
): Promise<{ slug: string; status: string; photos: string[]; missing: string[] }[]> {
  const written = [];
  for (const post of await exportAllPosts(db)) {
    const folder = path.join(dir, "writing", post.slug);
    await rm(folder, { recursive: true, force: true });
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, "index.md"), post.markdown);
    const photos: string[] = [];
    const missing: string[] = [];
    for (const photo of post.photos) {
      const blob = await read(photo.blobPathname);
      if (!blob) {
        missing.push(photo.name);
        continue;
      }
      await writeFile(path.join(folder, photo.name), Buffer.from(await new Response(blob.stream).arrayBuffer()));
      photos.push(photo.name);
    }
    written.push({ slug: post.slug, status: post.status, photos, missing });
  }
  return written;
}
