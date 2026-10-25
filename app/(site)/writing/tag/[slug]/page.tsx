import { notFound } from "next/navigation";
import WritingIndex from "@/components/WritingIndex";
import { getWritingListing, getWritingTaxonomy } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";
import { withPlaceholder } from "@/lib/static-params";

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

export default async function TagPage({ params }: Props) {
  const { slug } = await params;
  const listing = await getWritingListing("tag", slug);
  if (!listing) notFound();
  const { term, posts, categories, tags } = listing;
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
