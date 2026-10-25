import { Suspense } from "react";
import { PageFallback } from "@/components/PageFallback";
import WritingIndex from "@/components/WritingIndex";
import { getWritingListing, getWritingTaxonomy } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";
import { found, withPlaceholder } from "@/lib/static-params";

// An unknown slug gets a real 404 on its first request (lib/static-params.ts).
export const ensureStatic = "navigation";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const { tags } = await getWritingTaxonomy();
  return withPlaceholder(tags.map((t) => ({ slug: t.slug })));
}

export async function generateMetadata({ params }: Props) {
  const listing = await getWritingListing("tag", (await params).slug);
  if (!listing) return { title: "Not found", robots: { index: false } };
  const { term } = listing;
  return {
    ...pageMetadata({
      title: `Tagged “${term.name}” — Writing`,
      description: `${term.count} piece${term.count === 1 ? "" : "s"} of writing tagged “${term.name}”.`,
      path: `/writing/tag/${term.slug}`,
      image: "/writing/og.png",
    }),
    // Tag pages help readers browse but are thin for search; categories carry the SEO.
    robots: { index: false, follow: true },
  };
}

// The URL is read inside <Suspense>, so the route's shared App Shell doesn't
// depend on it; every URL is still prerendered in full.
export default function TagPage({ params }: Props) {
  return (
    <Suspense fallback={<PageFallback />}>
      <TagListing params={params} />
    </Suspense>
  );
}

async function TagListing({ params }: Props) {
  const { slug } = await params;
  const { term, posts, categories, tags } = found(await getWritingListing("tag", slug));
  return (
    <WritingIndex
      eyebrow="Writing · Tag"
      title={<>#{term.name}</>}
      intro={`${term.count} piece${term.count === 1 ? "" : "s"} tagged “${term.name}”.`}
      posts={posts}
      categories={categories}
      tags={tags}
      active={{ kind: "tag", slug }}
    />
  );
}
