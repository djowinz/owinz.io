import { getWritingPosts } from "@/lib/content";
import { renderOgCard } from "@/lib/og";

export async function GET() {
  const posts = await getWritingPosts();
  return renderOgCard({
    eyebrow: "Archive",
    title: "Writing",
    dek: "Notes on design, engineering, and the slow craft of making software that doesn't shout.",
    meta: [`${posts.length} pieces`],
  });
}
