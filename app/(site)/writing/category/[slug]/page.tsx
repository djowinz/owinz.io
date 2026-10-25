import { Suspense } from "react";
import { JsonLd } from "@/components/JsonLd";
import { PageFallback } from "@/components/PageFallback";
import WritingIndex from "@/components/WritingIndex";
import { getWritingListing, getWritingTaxonomy } from "@/lib/content";
import { blogSchema, breadcrumbSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { found, withPlaceholder } from "@/lib/static-params";

// An unknown slug gets a real 404 on its first request (lib/static-params.ts).
export const ensureStatic = "navigation";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const { categories } = await getWritingTaxonomy();
  return withPlaceholder(categories.map((c) => ({ slug: c.slug })));
}

const describe = (name: string, description: string) =>
  description || `Essays on ${name.toLowerCase()} by ${SITE.name}: what I've learned building software, and how.`;

export async function generateMetadata({ params }: Props) {
  const listing = await getWritingListing("category", (await params).slug);
  if (!listing) return { title: "Not found", robots: { index: false } };
  const { term } = listing;
  return pageMetadata({
    title: `${term.name} — Writing`,
    description: describe(term.name, term.description),
    path: `/writing/category/${term.slug}`,
    image: "/writing/og.png",
  });
}

// The URL is read inside <Suspense>, so the route's shared App Shell doesn't
// depend on it; every URL is still prerendered in full.
export default function CategoryPage({ params }: Props) {
  return (
    <Suspense fallback={<PageFallback />}>
      <CategoryListing params={params} />
    </Suspense>
  );
}

async function CategoryListing({ params }: Props) {
  const { slug } = await params;
  const { term, posts, categories, tags } = found(await getWritingListing("category", slug));

  return (
    <>
      <JsonLd
        data={[
          blogSchema(posts),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Writing", path: "/writing" },
            { name: term.name, path: `/writing/category/${slug}` },
          ]),
        ]}
      />
      <WritingIndex
        eyebrow="Writing · Category"
        title={term.name}
        intro={describe(term.name, term.description)}
        posts={posts}
        categories={categories}
        tags={tags}
        active={{ kind: "category", slug }}
      />
    </>
  );
}
