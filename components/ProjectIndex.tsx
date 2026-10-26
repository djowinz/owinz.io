import Link from "next/link";
import type { ProjectPost, TermSummary } from "@/lib/content";
import { SITE } from "@/lib/site";
import ProjectFilters, { type ActiveProjectFilter } from "./ProjectFilters";

/**
 * The /projects page, filtered or not (/projects, /projects/category|technology/<slug>).
 * Projects keep their number from the full list, so "№ 03" means the same
 * project on every page.
 */
export default function ProjectIndex({
  crumbs,
  title,
  intro,
  projects,
  shown = projects,
  categories,
  technologies,
  active,
  children,
}: {
  /** Breadcrumb after "Index", e.g. ["Projects"] or ["Projects", "Tooling"]. */
  crumbs: string[];
  title: React.ReactNode;
  intro: React.ReactNode;
  /** Every live project, in display order (for numbering). */
  projects: ProjectPost[];
  /** The ones this page lists. */
  shown?: ProjectPost[];
  categories: TermSummary[];
  technologies: TermSummary[];
  active: ActiveProjectFilter;
  /** Extra sections between the list and the contact footer. */
  children?: React.ReactNode;
}) {
  const number = new Map(projects.map((p, i) => [p.slug, String(i + 1).padStart(2, "0")]));

  return (
    <div className="max-w-[880px] mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2.5 font-mono font-medium uppercase text-muted text-[11px] tracking-[1.3px] mb-10 sm:mb-12">
        <span>Index</span>
        {crumbs.map((crumb, i) => (
          <span key={crumb} className="flex items-center gap-2.5">
            <span className="opacity-40">/</span>
            {i < crumbs.length - 1 ? (
              <Link href="/projects" className="cursor-none transition-colors hover:text-accent">
                {crumb}
              </Link>
            ) : (
              <span className="text-foreground">{crumb}</span>
            )}
          </span>
        ))}
      </div>

      {/* Hero */}
      <header className="mb-10 sm:mb-12 max-w-[640px]">
        <h1 className="font-fraunces font-light text-[44px] sm:text-[56px] md:text-[68px] tracking-[-0.035em] leading-[0.98] mb-6">
          {title}
        </h1>
        <p className="text-base sm:text-[17px] leading-relaxed text-muted max-w-[520px]">{intro}</p>
      </header>

      <ProjectFilters categories={categories} technologies={technologies} active={active} />

      {/* Project list */}
      <section className="mb-16 sm:mb-20">
        {shown.map((project) => (
          <Link
            key={project.slug}
            href={`/projects/${project.slug}`}
            className="group grid grid-cols-[24px_1fr_auto] gap-4 sm:grid-cols-[48px_1fr_80px_20px] sm:gap-6 py-6 sm:py-7 items-start border-t border-edge last:border-b cursor-none transition-colors hover:bg-accent/[0.025]"
          >
            <div className="font-mono text-muted text-[11px] tracking-[0.9px] pt-1.5">{number.get(project.slug)}</div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 mb-1.5">
                <h3 className="font-fraunces text-[26px] sm:text-[30px] tracking-[-0.6px] leading-none group-hover:italic">
                  {project.title}
                </h3>
                {project.category && (
                  <span className="font-mono uppercase text-muted text-[10px] tracking-[1px]">— {project.category}</span>
                )}
              </div>
              {project.description && (
                <p className="text-sm leading-relaxed text-muted mb-3 max-w-[520px]">{project.description}</p>
              )}
              <div className="flex flex-wrap gap-x-3.5 gap-y-1">
                {project.technologies.map((tech) => (
                  <span key={tech} className="font-mono uppercase text-muted text-[10px] tracking-[0.6px]">
                    {tech}
                  </span>
                ))}
              </div>
            </div>
            <div className="font-mono text-muted text-[11px] tracking-[0.4px] pt-1.5 text-right">{project.year}</div>
            <div className="hidden sm:block pt-2.5 text-lg text-accent font-fraunces opacity-25 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0">
              →
            </div>
          </Link>
        ))}
        {shown.length === 0 && <p className="border-t border-edge py-6 text-sm text-muted">Nothing here yet.</p>}
      </section>

      {children}

      {/* Contact footer */}
      <section className="border-t border-edge pt-10 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-8 sm:items-end">
        <div>
          <p className="font-fraunces-italic italic font-light text-2xl sm:text-[28px] tracking-[-0.42px] leading-tight mb-3 max-w-[420px]">
            Have something you&apos;d like to build together?
          </p>
          <a href={`mailto:${SITE.email}`} className="text-sm text-accent underline underline-offset-4 cursor-none">
            {SITE.email}
          </a>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 font-mono uppercase text-muted text-[11px] tracking-[0.9px]">
          {SITE.socials.map((social) => (
            <a key={social.label} href={social.url} className="cursor-none transition-colors hover:text-accent">
              {social.label} ↗
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
