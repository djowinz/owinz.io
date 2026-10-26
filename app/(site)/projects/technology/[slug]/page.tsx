import { notFound } from "next/navigation";
import ProjectIndex from "@/components/ProjectIndex";
import { getProjectListing, getProjectTaxonomy } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";
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
  const { technologies } = await getProjectTaxonomy();
  return withPlaceholder(technologies.map((t) => ({ slug: t.slug })));
}

const count = (n: number) => `${n} project${n === 1 ? "" : "s"}`;

export async function generateMetadata({ params }: Props) {
  const listing = await getProjectListing("technology", (await params).slug);
  if (!listing) return { title: "Not found", robots: { index: false } };
  const { term } = listing;
  return {
    ...pageMetadata({
      title: `Built with ${term.name} — Projects`,
      description: `${count(term.count)} built with ${term.name}.`,
      path: `/projects/technology/${term.slug}`,
      image: "/projects/og.png",
    }),
    // Technology pages help readers browse but are thin for search; categories carry the SEO.
    robots: { index: false, follow: true },
  };
}

export default async function ProjectTechnologyPage({ params }: Props) {
  const { slug } = await params;
  const listing = await getProjectListing("technology", slug);
  if (!listing) notFound();
  const { term, projects, categories, technologies } = listing;
  return (
    <ProjectIndex
      crumbs={["Projects", `Built with ${term.name}`]}
      title={<>Built with {term.name}</>}
      intro={`${count(term.count)} built with ${term.name}.`}
      projects={projects}
      shown={projects.filter((p) => p.technologyRefs.some((t) => t.slug === slug))}
      categories={categories}
      technologies={technologies}
      active={{ kind: "technology", slug }}
    />
  );
}
