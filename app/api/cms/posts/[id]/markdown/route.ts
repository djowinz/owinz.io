import { exportPostById } from "@/lib/cms/export";
import { getCmsUser } from "@/lib/cms/session";
import { getDb } from "@/lib/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The editor's "Export .md": a post's working draft as Markdown with YAML
// frontmatter (lib/cms/export.ts), for signed-in CMS users only. Photos are
// referenced by file name, as in a content/writing/<slug>/ folder.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCmsUser())) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const post = UUID.test(id) ? await exportPostById(getDb(), id) : null;
  if (!post) return new Response("Not found", { status: 404 });
  return new Response(post.markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${post.slug}.md"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
