import Link from "next/link";
import type { TermSummary, WritingPost } from "@/lib/content";
import WritingArchive, { toArchiveEntries } from "./WritingArchive";
import WritingFilters, { type ActiveFilter } from "./WritingFilters";

/** The writing archive page, filtered or not (/writing, /writing/category|tag/<slug>). */
export default function WritingIndex({
  eyebrow,
  title,
  intro,
  posts,
  categories,
  tags,
  active,
}: {
  eyebrow: string;
  title: React.ReactNode;
  intro: React.ReactNode;
  posts: WritingPost[];
  categories: TermSummary[];
  tags: TermSummary[];
  active: ActiveFilter;
}) {
  const entries = toArchiveEntries(posts);
  const years = new Set(entries.map((e) => e.year));

  return (
    <>
      {/* Masthead */}
      <div className="flex justify-between items-baseline font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-7">
        <span>{eyebrow}</span>
        <span>
          {entries.length} piece{entries.length === 1 ? "" : "s"} · {years.size} year{years.size === 1 ? "" : "s"}
        </span>
      </div>

      {/* Hero */}
      <h1 className="font-fraunces font-light text-[56px] sm:text-[72px] md:text-[96px] tracking-[-0.035em] leading-[0.95] mb-5">
        {title}
      </h1>
      <p className="font-fraunces-italic italic font-light text-lg sm:text-[22px] leading-snug text-muted mb-12 sm:mb-16 max-w-[620px]">
        {intro}
      </p>

      <WritingFilters categories={categories} tags={tags} active={active} />
      <WritingArchive entries={entries} />

      {/* RSS note */}
      <div className="mt-6 px-5 sm:px-6 py-5 bg-(--sidebar) border border-edge flex flex-wrap gap-x-6 gap-y-2 justify-between items-center font-mono text-[11px] tracking-[0.4px] text-muted">
        <span>Reader? There&apos;s an RSS feed.</span>
        <Link href="/feed.xml" className="text-accent cursor-none">
          /feed.xml ↗
        </Link>
      </div>
    </>
  );
}
