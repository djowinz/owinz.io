import { getProjects, getProjectTaxonomy, getTalks } from "@/lib/content";
import { JsonLd } from "@/components/JsonLd";
import ProjectIndex from "@/components/ProjectIndex";
import { projectListSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Projects",
  description:
    "Software projects by Dyllen Owens — case studies on what was built, why, and what each one taught.",
  path: "/projects",
  image: "/projects/og.png",
});

export default async function Projects() {
  const [projects, { categories, technologies }, { past: pastTalks }] = await Promise.all([
    getProjects(),
    getProjectTaxonomy(),
    getTalks(),
  ]);

  return (
    <>
      <JsonLd data={projectListSchema(projects)} />
      <ProjectIndex
        crumbs={["Projects"]}
        title={
          <>
            Things I&apos;ve <em className="font-normal font-fraunces-italic">built</em>, carefully.
          </>
        }
        intro={
          <>
            A small collection of projects. Each solves a problem I had. Each taught me something I didn&apos;t
            expect.
          </>
        }
        projects={projects}
        categories={categories}
        technologies={technologies}
        active={null}
      >
        {/* Recent talks (hidden while empty) */}
        {pastTalks.length > 0 && (
          <section className="mb-16">
            <div className="flex items-baseline gap-5 mb-7">
              <span className="font-mono uppercase text-accent text-[11px] tracking-[1.3px]">— Also</span>
              <h2 className="font-fraunces-italic italic font-normal text-2xl tracking-[-0.24px]">Recent talks</h2>
            </div>
            <div className="border-t border-edge">
              {pastTalks.slice(0, 3).map((talk) => (
                <div
                  key={talk.slug}
                  className="grid grid-cols-1 gap-1 sm:grid-cols-[120px_1fr_auto] sm:gap-6 py-4.5 border-b border-edge text-sm text-muted"
                >
                  <span className="font-mono text-[11px]">{talk.date}</span>
                  <span className="text-foreground">{talk.title}</span>
                  <span className="italic">{talk.venue}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </ProjectIndex>
    </>
  );
}
