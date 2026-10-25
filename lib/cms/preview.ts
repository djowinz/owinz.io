// Renders a draft for the editor's preview pane with the site's own
// Markdown pipeline. Photos point at the CMS photo route, which serves
// unpublished photos to signed-in users only.
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { assets } from "../db/schema";
import { markdownToHtml } from "../content/render";

export async function renderDraftPreview(db: Db, postId: string, markdown: string): Promise<string> {
  const rows = await db.select().from(assets).where(eq(assets.postId, postId));
  const byName = new Map(rows.map((row) => [row.name, row]));
  return markdownToHtml(markdown.slice(0, 200_000), {
    resolve: async (name) => {
      const asset = byName.get(name);
      if (!asset) return undefined;
      return {
        src: `/api/cms/photos/${asset.id}/?v=${asset.updatedAt.getTime().toString(36)}`,
        ...(asset.width && asset.height ? { width: asset.width, height: asset.height } : {}),
      };
    },
  });
}
