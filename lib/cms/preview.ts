// Renders a draft with the site's own Markdown pipeline: the editor's preview
// pane (renderDraftPreview) and the full-page draft preview (draftPost, shown
// with the live article's components). Photos point at the CMS photo route,
// which serves unpublished photos to signed-in users only.
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { assets, posts, type AssetRow } from "../db/schema";
import { buildWritingPost, markdownToHtml, type ImageResolver } from "../content/render";
import { postTagIds, resolveRefs, termsById, toRef } from "../content/terms";
import type { WritingPost } from "../content/types";

function draftResolver(rows: AssetRow[]): ImageResolver {
  const byName = new Map(rows.map((row) => [row.name, row]));
  return async (name) => {
    const asset = byName.get(name);
    if (!asset) return undefined;
    return {
      src: `/api/cms/photos/${asset.id}/?v=${asset.updatedAt.getTime().toString(36)}`,
      ...(asset.width && asset.height ? { width: asset.width, height: asset.height } : {}),
    };
  };
}

export async function renderDraftPreview(db: Db, postId: string, markdown: string): Promise<string> {
  const rows = await db.select().from(assets).where(eq(assets.postId, postId));
  return markdownToHtml(markdown.slice(0, 200_000), { resolve: draftResolver(rows) });
}

/** A post's working draft as the site would render it; null if there's no such post. */
export async function draftPost(db: Db, postId: string): Promise<WritingPost | null> {
  const [row] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!row) return null;
  const [photos, tagIds, byId] = await Promise.all([
    db.select().from(assets).where(eq(assets.postId, postId)),
    postTagIds(db, postId),
    termsById(db, "writing"),
  ]);
  const category = row.categoryId ? byId.get(row.categoryId) : undefined;
  return buildWritingPost(
    {
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      date: row.date,
      updated: row.updated,
      byline: row.byline,
      category: category ? toRef(category) : null,
      tags: resolveRefs(tagIds, byId),
      body: row.body,
    },
    draftResolver(photos),
  );
}
