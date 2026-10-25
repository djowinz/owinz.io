import { format } from "date-fns";
import { readingTime } from "reading-time-estimator";
import { parseDate } from "@/lib/dates";
import { imageContentType, processImage } from "@/lib/images";
import { getWritingPost, getWritingPosts, type WritingPost } from "@/lib/markdown";
import { renderOgCard } from "@/lib/og";

export const dynamic = "force-static";
export const dynamicParams = false;

// Files published beside each article:
//   og.png       the generated social card
//   <photo>      photos a folder-style post references
//                (content/writing/<slug>/photo.jpg → /writing/<slug>/photo.jpg)
// One route serves both because static export rejects a dynamic route with
// no params, which a photos-only route would be until the first photo.
const OG_CARD = "og.png";

export async function generateStaticParams() {
  const posts = await getWritingPosts();
  return posts.flatMap((post) => [
    { slug: post.slug, file: OG_CARD },
    ...post.images.map(({ name }) => ({ slug: post.slug, file: name })),
  ]);
}

function ogCard(post: WritingPost) {
  const date = parseDate(post.date);
  return renderOgCard({
    eyebrow: ["Writing", post.category].filter(Boolean).join(" · "),
    title: post.title,
    dek: post.description,
    meta: [
      date ? format(date, "d MMM yyyy") : "",
      `${readingTime(post.markdown).minutes} min read`,
    ].filter(Boolean),
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; file: string }> },
) {
  const { slug, file } = await params;
  const post = await getWritingPost(slug);
  if (!post) return new Response("Not found", { status: 404 });

  const name = decodeURIComponent(file);
  if (name === OG_CARD) return ogCard(post);

  const photo = post.images.find((img) => img.name === name);
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(await processImage(photo.file)), {
    headers: { "Content-Type": imageContentType(photo.name) },
  });
}
