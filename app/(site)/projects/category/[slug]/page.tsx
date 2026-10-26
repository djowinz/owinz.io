import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import ProjectIndex from "@/components/ProjectIndex";
import { getProjectListing, getProjectTaxonomy } from "@/lib/content";
import { breadcrumbSchema, projectListSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { withPlaceholder } from "@/lib/static-params";

interface Props {
  params: Promise<{ slug: string }>;
}

// Prerendered per slug: an unknown slug is rendered (and cached) as a real
// 404 before any HTML is sent, rather than streaming a fallback shell with a
// 200. Every read goes through a `use cache` getter; navigation stays fast
// because each slug's page is static.
export const ensureStatic = "navigation";
export const instant = false;

export async function generateStaticParams() {
  const { categories } = await getProjectTaxonomy();
  return withPlaceholder(categories.map((c) => ({ slug: c.slug })));
}

const describe = (name: string, description: string) =>
  description || `${name} projects by ${SITE.name}: case studies on what was built, why, and what each one taught.`;

export async function generateMetadata({ params }: Props) {
  const listing = await getProjectListing("category", (await params).slug);
  if (!listing) return { title: "Not found", robots: { index: false } };
  const { term } = listing;
  return pageMetadata({
    title: `${term.name} — Projects`,
    description: describe(term.name, term.description),
    path: `/projects/category/${term.slug}`,
    image: "/projects/og.png",
  });
}

export default async function ProjectCategoryPage({ params }: Props) {
  const { slug } = await params;
  const listing = await getProjectListing("category", slug);
  if (!listing) notFound();
  const { term, projects, categories, technologies } = listing;
  const shown = projects.filter((p) => p.categoryRef?.slug === slug);

  return (
    <>
      <JsonLd
        data={[
          projectListSchema(shown, { path: `/projects/category/${slug}`, name: `${term.name} projects` }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Projects", path: "/projects" },
            { name: term.name, path: `/projects/category/${slug}` },
          ]),
        ]}
      />
      <ProjectIndex
        crumbs={["Projects", term.name]}
        title={term.name}
        intro={describe(term.name, term.description)}
        projects={projects}
        shown={shown}
        categories={categories}
        technologies={technologies}
        active={{ kind: "category", slug }}
      />
    </>
  );
}
