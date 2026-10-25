import { format } from "date-fns";
import { readingTime } from "reading-time-estimator";
import { parseDate } from "@/lib/dates";
import { getWritingPost, getWritingPosts } from "@/lib/content";
import { renderOgCard } from "@/lib/og";
import { withPlaceholder } from "@/lib/static-params";

export async function generateStaticParams() {
  const posts = await getWritingPosts();
  return withPlaceholder(posts.map((post) => ({ slug: post.slug })));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const post = await getWritingPost(slug);
  if (!post) return new Response("Not found", { status: 404 });
  const date = parseDate(post.date);
  return renderOgCard({
    eyebrow: ["Writing", post.category].filter(Boolean).join(" · "),
    title: post.title,
    dek: post.description,
    byline: post.author,
    meta: [
      date ? format(date, "d MMM yyyy") : "",
      `${readingTime(post.markdown).minutes} min read`,
    ].filter(Boolean),
  });
}
