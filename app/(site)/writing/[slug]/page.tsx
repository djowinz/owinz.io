import { getWritingPost, getWritingPosts } from "@/lib/content";
import { ArticleView } from "@/components/ArticleView";
import { isoDate, pageMetadata } from "@/lib/seo";
import { found, withPlaceholder } from "@/lib/static-params";
import { notFoundMetadata } from "@/components/NotFoundContent";

// An unknown slug gets a real 404 on its first request (lib/static-params.ts).
export const ensureStatic = "navigation";
// Prerendered per slug, so navigations here are effectively instant anyway;
// reading params outside <Suspense> keeps the article in the HTML, in order.
export const instant = false;

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
  if (!post) return notFoundMetadata;
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

export default async function WritingPostPage({
  params,
}: WritingPostPageProps) {
  const { slug } = await params;
  const post = found(await getWritingPost(slug));
  const readNext = (await getWritingPosts())
    .filter((p) => p.slug !== slug)
    .slice(0, 2);

  return <ArticleView post={post} readNext={readNext} />;
}
