import Link from "next/link";
import type { TermSummary } from "@/lib/content";
import { cn } from "@/lib/utils";

export type ActiveFilter = { kind: "category" | "tag"; slug: string } | null;

const chip = "px-3 py-1.5 border transition-colors cursor-none";
const on = "border-foreground bg-foreground text-background";
const off = "border-edge text-muted hover:border-foreground";
const TAGS_SHOWN = 12;

/**
 * Category and tag filters as plain links to /writing/category|tag/<slug>/:
 * real, cacheable pages that work without JavaScript.
 */
export default function WritingFilters({
  categories,
  tags,
  active,
}: {
  categories: TermSummary[];
  tags: TermSummary[];
  active: ActiveFilter;
}) {
  const tagLink = (tag: TermSummary) => {
    const isActive = active?.kind === "tag" && active.slug === tag.slug;
    return (
      <Link
        key={tag.slug}
        href={isActive ? "/writing" : `/writing/tag/${tag.slug}`}
        aria-current={isActive ? "page" : undefined}
        className={cn("transition-colors cursor-none", isActive ? "text-accent" : "text-muted hover:text-accent")}
      >
        #{tag.name}
        <span className="ml-1 opacity-60">{tag.count}</span>
      </Link>
    );
  };
  const shown = tags.slice(0, TAGS_SHOWN);
  const rest = tags.slice(TAGS_SHOWN);
  // Keep the active tag visible even when it's past the cutoff.
  const activeHidden = active?.kind === "tag" && rest.some((t) => t.slug === active.slug);

  return (
    <nav aria-label="Filter writing" className="mb-10 sm:mb-14 font-mono text-[11px] tracking-[0.7px]">
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <Link href="/writing" aria-current={active === null ? "page" : undefined} className={cn(chip, active === null ? on : off)}>
            All
          </Link>
          {categories.map((category) => {
            const isActive = active?.kind === "category" && active.slug === category.slug;
            return (
              <Link
                key={category.slug}
                href={isActive ? "/writing" : `/writing/category/${category.slug}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(chip, isActive ? on : off)}
              >
                {category.name}
              </Link>
            );
          })}
        </div>
      )}
      {tags.length > 0 && (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <span className="font-medium uppercase text-[10px] tracking-[1.4px] text-muted">Tags</span>
          {shown.map(tagLink)}
          {rest.length > 0 && (
            <details className="contents" open={activeHidden}>
              <summary className="cursor-none list-none text-muted hover:text-accent [&::-webkit-details-marker]:hidden">
                +{rest.length} more
              </summary>
              {rest.map(tagLink)}
            </details>
          )}
        </div>
      )}
    </nav>
  );
}
