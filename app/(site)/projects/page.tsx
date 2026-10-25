import { getProjects, getTalks } from "@/lib/content";
import { SITE } from "@/lib/site";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
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
  const projects = await getProjects();
  const { past: pastTalks } = await getTalks();

  return (
    <div className="max-w-[880px] mx-auto">
      <JsonLd data={projectListSchema(projects)} />
      {/* Breadcrumb */}
      <div className="flex items-center gap-2.5 font-mono font-medium uppercase text-muted text-[11px] tracking-[1.3px] mb-10 sm:mb-12">
        <span>Index</span>
        <span className="opacity-40">/</span>
        <span className="text-foreground">Projects</span>
      </div>

      {/* Hero */}
      <header className="mb-12 sm:mb-16 max-w-[640px]">
        <h1 className="font-fraunces font-light text-[44px] sm:text-[56px] md:text-[68px] tracking-[-0.035em] leading-[0.98] mb-6">
          Things I&apos;ve{" "}
          <em className="font-normal font-fraunces-italic">built</em>,
          carefully.
        </h1>
        <p className="text-base sm:text-[17px] leading-relaxed text-muted max-w-[520px]">
          A small collection of projects. Each solves a problem I had. Each
          taught me something I didn&apos;t expect.
        </p>
      </header>

      {/* Project list */}
      <section className="mb-16 sm:mb-20">
        {projects.map((project, i) => (
          <Link
            key={project.slug}
            href={`/projects/${project.slug}`}
            className="group grid grid-cols-[24px_1fr_auto] gap-4 sm:grid-cols-[48px_1fr_80px_20px] sm:gap-6 py-6 sm:py-7 items-start border-t border-edge last:border-b cursor-none transition-colors hover:bg-accent/[0.025]"
          >
            <div className="font-mono text-muted text-[11px] tracking-[0.9px] pt-1.5">
              {String(i + 1).padStart(2, "0")}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 mb-1.5">
                <h3 className="font-fraunces text-[26px] sm:text-[30px] tracking-[-0.6px] leading-none group-hover:italic">
                  {project.title}
                </h3>
                {project.category && (
                  <span className="font-mono uppercase text-muted text-[10px] tracking-[1px]">
                    — {project.category}
                  </span>
                )}
              </div>
              {project.description && (
                <p className="text-sm leading-relaxed text-muted mb-3 max-w-[520px]">
                  {project.description}
                </p>
              )}
              <div className="flex flex-wrap gap-x-3.5 gap-y-1">
                {project.technologies.map((tech) => (
                  <span
                    key={tech}
                    className="font-mono uppercase text-muted text-[10px] tracking-[0.6px]"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
            <div className="font-mono text-muted text-[11px] tracking-[0.4px] pt-1.5 text-right">
              {project.year}
            </div>
            <div className="hidden sm:block pt-2.5 text-lg text-accent font-fraunces opacity-25 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0">
              →
            </div>
          </Link>
        ))}
      </section>

      {/* Recent talks (hidden while empty) */}
      {pastTalks.length > 0 && (
        <section className="mb-16">
          <div className="flex items-baseline gap-5 mb-7">
            <span className="font-mono uppercase text-accent text-[11px] tracking-[1.3px]">
              — Also
            </span>
            <h2 className="font-fraunces-italic italic font-normal text-2xl tracking-[-0.24px]">
              Recent talks
            </h2>
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

      {/* Contact footer */}
      <section className="border-t border-edge pt-10 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-8 sm:items-end">
        <div>
          <p className="font-fraunces-italic italic font-light text-2xl sm:text-[28px] tracking-[-0.42px] leading-tight mb-3 max-w-[420px]">
            Have something you&apos;d like to build together?
          </p>
          <a
            href={`mailto:${SITE.email}`}
            className="text-sm text-accent underline underline-offset-4 cursor-none"
          >
            {SITE.email}
          </a>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 font-mono uppercase text-muted text-[11px] tracking-[0.9px]">
          {SITE.socials.map((social) => (
            <a
              key={social.label}
              href={social.url}
              className="cursor-none transition-colors hover:text-accent"
            >
              {social.label} ↗
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
