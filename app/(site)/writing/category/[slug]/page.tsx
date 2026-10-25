import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import WritingIndex from "@/components/WritingIndex";
import { getWritingListing, getWritingTaxonomy } from "@/lib/content";
import { blogSchema, breadcrumbSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { withPlaceholder } from "@/lib/static-params";

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

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const listing = await getWritingListing("category", slug);
  if (!listing) notFound();
  const { term, posts, categories, tags } = listing;

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
