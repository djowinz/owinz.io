import { format } from "date-fns";
import Link from "next/link";
import { readingTime } from "reading-time-estimator";
import type { WritingPost } from "@/lib/content";
import { parseDate } from "@/lib/dates";
import { isoDate } from "@/lib/seo";

export interface ArchiveEntry {
  slug: string;
  title: string;
  excerpt: string;
  category?: { name: string; slug: string };
  year: string;
  dateDisplay: string;
  dateIso?: string;
  readDisplay: string;
}

export function toArchiveEntries(posts: WritingPost[]): ArchiveEntry[] {
  return posts.map((post) => {
    const date = parseDate(post.date);
    return {
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      category: post.categoryRef,
      year: date ? format(date, "yyyy") : "Undated",
      dateDisplay: date ? format(date, "MMM dd") : "—",
      dateIso: isoDate(post.date),
      readDisplay: `${readingTime(post.markdown).minutes} min`,
    };
  });
}

/** Posts grouped by year, newest first. Rendered on the server: no client JavaScript. */
export default function WritingArchive({ entries }: { entries: ArchiveEntry[] }) {
  const grouped = new Map<string, ArchiveEntry[]>();
  for (const entry of entries) grouped.set(entry.year, [...(grouped.get(entry.year) ?? []), entry]);
  const years = [...grouped.entries()].sort(([a], [b]) => b.localeCompare(a));

  return (
    <>
      {years.map(([year, posts]) => (
        <section key={year} className="mb-14">
          <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[80px_1fr] gap-6 items-baseline border-t border-foreground pt-5 mb-2">
            <h2 className="font-fraunces font-light text-[44px] sm:text-[56px] tracking-[-0.03em] leading-none">
              {year}
            </h2>
            <div className="font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] text-right">
              {posts.length} piece{posts.length === 1 ? "" : "s"}
            </div>
          </div>
          {posts.map((post) => (
            <article
              key={post.slug}
              className="relative grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 sm:grid-cols-[80px_1fr_90px] sm:gap-6 items-start py-5 sm:py-6 border-t border-edge last:border-b transition-colors hover:bg-accent/5"
            >
              <time dateTime={post.dateIso} className="font-mono text-muted text-[11px] tracking-[0.7px] sm:pt-1.5">
                {post.dateDisplay}
              </time>
              <div className="order-last col-span-full sm:order-none sm:col-span-1">
                <div className="flex flex-wrap gap-x-3 gap-y-1.5 items-baseline mb-2">
                  <h3 className="font-fraunces text-[22px] sm:text-2xl tracking-[-0.36px] leading-tight">
                    {/* The title link covers the whole row; the category link sits above it. */}
                    <Link href={`/writing/${post.slug}`} className="cursor-none after:absolute after:inset-0">
                      {post.title}
                    </Link>
                  </h3>
                  {post.category && (
                    <Link
                      href={`/writing/category/${post.category.slug}`}
                      className="relative z-[1] font-mono uppercase text-accent text-[9px] tracking-[1.1px] whitespace-nowrap border border-edge px-1.5 py-0.5 cursor-none transition-colors hover:border-accent"
                    >
                      {post.category.name}
                    </Link>
                  )}
                </div>
                {post.excerpt && <p className="text-sm leading-relaxed text-muted max-w-[520px]">{post.excerpt}</p>}
              </div>
              <div className="font-mono text-muted text-[10px] tracking-[0.6px] text-right sm:pt-2">
                {post.readDisplay} →
              </div>
            </article>
          ))}
        </section>
      ))}
    </>
  );
}
