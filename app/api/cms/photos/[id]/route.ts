import { eq } from "drizzle-orm";
import { readBlob } from "@/lib/blob";
import { getDb } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { getCmsUser } from "@/lib/cms/session";

// Any uploaded photo, published or not, for signed-in CMS users (the editor
// preview and photo tray). The public site serves photos from
// /writing/<slug>/<photo> instead, and only those the live version shows.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCmsUser())) return new Response("Not found", { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const [asset] = await getDb().select().from(assets).where(eq(assets.id, id));
  const blob = asset && (await readBlob(asset.blobPathname));
  if (!asset || !blob) return new Response("Not found", { status: 404 });
  return new Response(blob.stream, {
    headers: { "Content-Type": asset.contentType, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
