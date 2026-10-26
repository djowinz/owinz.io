import Link from "next/link";
import type { TermSummary } from "@/lib/content";
import { cn } from "@/lib/utils";

export type ActiveProjectFilter = { kind: "category" | "technology"; slug: string } | null;

const chip = "px-3 py-1.5 border transition-colors cursor-none";
const on = "border-foreground bg-foreground text-background";
const off = "border-edge text-muted hover:border-foreground";
const SHOWN = 12;

/**
 * Category and technology filters as plain links to
 * /projects/category|technology/<slug>/: real, cacheable pages that work
 * without JavaScript (the /projects counterpart of WritingFilters).
 */
export default function ProjectFilters({
  categories,
  technologies,
  active,
}: {
  categories: TermSummary[];
  technologies: TermSummary[];
  active: ActiveProjectFilter;
}) {
  const techLink = (tech: TermSummary) => {
    const isActive = active?.kind === "technology" && active.slug === tech.slug;
    return (
      <Link
        key={tech.slug}
        href={isActive ? "/projects" : `/projects/technology/${tech.slug}`}
        aria-current={isActive ? "page" : undefined}
        className={cn("transition-colors cursor-none", isActive ? "text-accent" : "text-muted hover:text-accent")}
      >
        {tech.name}
        <span className="ml-1 opacity-60">{tech.count}</span>
      </Link>
    );
  };
  const shown = technologies.slice(0, SHOWN);
  const rest = technologies.slice(SHOWN);
  // Keep the active technology visible even when it's past the cutoff.
  const activeHidden = active?.kind === "technology" && rest.some((t) => t.slug === active.slug);

  if (categories.length === 0 && technologies.length === 0) return null;
  return (
    <nav aria-label="Filter projects" className="mb-10 sm:mb-12 font-mono text-[11px] tracking-[0.7px]">
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <Link href="/projects" aria-current={active === null ? "page" : undefined} className={cn(chip, active === null ? on : off)}>
            All
          </Link>
          {categories.map((category) => {
            const isActive = active?.kind === "category" && active.slug === category.slug;
            return (
              <Link
                key={category.slug}
                href={isActive ? "/projects" : `/projects/category/${category.slug}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(chip, isActive ? on : off)}
              >
                {category.name}
              </Link>
            );
          })}
        </div>
      )}
      {technologies.length > 0 && (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <span className="font-medium uppercase text-[10px] tracking-[1.4px] text-muted">Built with</span>
          {shown.map(techLink)}
          {rest.length > 0 && (
            <details className="contents" open={activeHidden}>
              <summary className="cursor-none list-none text-muted hover:text-accent [&::-webkit-details-marker]:hidden">
                +{rest.length} more
              </summary>
              {rest.map(techLink)}
            </details>
          )}
        </div>
      )}
    </nav>
  );
}
