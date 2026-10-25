import { getWritingPosts } from "@/lib/markdown";
import { renderOgCard } from "@/lib/og";

export const dynamic = "force-static";

export async function GET() {
  const posts = await getWritingPosts();
  return renderOgCard({
    eyebrow: "Archive",
    title: "Writing",
    dek: "Notes on design, engineering, and the slow craft of making software that doesn't shout.",
    meta: [`${posts.length} pieces`],
  });
}
