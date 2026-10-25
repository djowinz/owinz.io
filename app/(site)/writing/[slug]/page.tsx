import { Suspense } from "react";
import { getWritingPost, getWritingPosts } from "@/lib/content";
import { ArticleView } from "@/components/ArticleView";
import { isoDate, pageMetadata } from "@/lib/seo";
import { PageFallback } from "@/components/PageFallback";
import { found, withPlaceholder } from "@/lib/static-params";

// An unknown slug gets a real 404 on its first request (lib/static-params.ts).
export const ensureStatic = "navigation";

interface WritingPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = await getWritingPosts();
  return withPlaceholder(posts.map((post) => ({ slug: post.slug })));
}

export async function generateMetadata({ params }: WritingPostPageProps) {
  const { slug } = await params;
  const post = await getWritingPost(slug);
  if (!post) return { title: "Post Not Found" };
  return pageMetadata({
    title: post.title,
    description: post.description,
    path: `/writing/${post.slug}`,
    image: `/writing/${post.slug}/og.png`,
    type: "article",
    publishedTime: isoDate(post.date),
    modifiedTime: isoDate(post.updated),
    section: post.category,
    tags: post.tags,
  });
}

// The URL is read inside <Suspense>, so the route's shared App Shell (what a
// default <Link> prefetches) doesn't depend on it. Every URL is still
// prerendered in full, so the article is in the HTML.
export default function WritingPostPage({ params }: WritingPostPageProps) {
  return (
    <Suspense fallback={<PageFallback />}>
      <Article params={params} />
    </Suspense>
  );
}

async function Article({ params }: WritingPostPageProps) {
  const { slug } = await params;
  const post = found(await getWritingPost(slug));
  const readNext = (await getWritingPosts())
    .filter((p) => p.slug !== slug)
    .slice(0, 2);

  return <ArticleView post={post} readNext={readNext} />;
}
