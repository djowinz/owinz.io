// Imports one Markdown writing entry (lib/content/files.ts) into the
// database: the post, its category and tags (created if new), and the photos
// it shows. Used by scripts/import-content.ts; storage is passed in so tests
// can import without writing files.
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import matter from "gray-matter";
import type { Db } from "../db";
import { assets, posts, postTags, type PostRow } from "../db/schema";
import { ensureTerm } from "../cms/taxonomy";
import { prepareImage } from "../images";
import type { StoredBlob } from "../blob";
import { parseWriting, writingSource, type MarkdownEntry } from "./files";
import { publishPost } from "./publishing";

export interface ImportOptions {
  upload: (pathname: string, body: Buffer, contentType: string) => Promise<StoredBlob>;
  log?: (...args: unknown[]) => void;
}

/**
 * Upserts the post by slug and publishes it, unless its frontmatter says
 * `status: draft` (as `pnpm content:export` writes for drafts).
 */
export async function importWritingEntry(db: Db, entry: MarkdownEntry, { upload, log = () => {} }: ImportOptions): Promise<PostRow> {
  const source = writingSource(entry);
  const { images } = await parseWriting(entry);

  // Frontmatter category and tags become (or reuse) writing terms.
  const category = source.category
    ? await ensureTerm(db, { kind: "category", collection: "writing", name: source.category.name })
    : null;
  const tagIds: string[] = [];
  for (const tag of source.tags ?? []) {
    const term = await ensureTerm(db, { kind: "tag", collection: "writing", name: tag.name });
    if (!tagIds.includes(term.id)) tagIds.push(term.id);
  }

  const fields = {
    slug: source.slug,
    title: source.title,
    excerpt: source.excerpt ?? "",
    categoryId: category?.id ?? null,
    date: source.date,
    updated: source.updated ?? null,
    byline: source.byline ?? null,
    body: source.body.trim(),
  };
  const [row] = await db
    .insert(posts)
    .values(fields)
    .onConflictDoUpdate({ target: posts.slug, set: fields })
    .returning();
  await db.delete(postTags).where(eq(postTags.postId, row.id));
  if (tagIds.length) {
    await db.insert(postTags).values(tagIds.map((termId, position) => ({ postId: row.id, termId, position })));
  }

  for (const name of images) {
    const photo = await prepareImage(path.join(entry.folder!, name), name);
    const blob = await upload(`writing/${source.slug}/${name}`, photo.data, photo.contentType);
    const asset = {
      postId: row.id,
      name,
      blobUrl: blob.url,
      blobPathname: blob.pathname,
      contentType: photo.contentType,
      width: photo.width ?? null,
      height: photo.height ?? null,
      bytes: photo.data.length,
    };
    await db
      .insert(assets)
      .values(asset)
      .onConflictDoUpdate({ target: [assets.postId, assets.name], set: asset });
    log(`  ↳ ${name} → ${blob.pathname} (${Math.round(photo.data.length / 1024)} KB)`);
  }
  const { status } = matter(fs.readFileSync(entry.file, "utf8")).data;
  return status === "draft" ? row : publishPost(db, row.id);
}
