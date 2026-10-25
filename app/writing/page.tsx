import { getWritingPosts } from "@/lib/markdown";
import WritingArchive, { ArchiveEntry } from "@/components/WritingArchive";
import { format } from "date-fns";
import { readingTime } from "reading-time-estimator";
import Link from "next/link";

export const metadata = {
  title: "Writing",
  description: "Notes on design, engineering, and the craft of software.",
};

export default async function Writing() {
  const posts = await getWritingPosts();

  const entries: ArchiveEntry[] = posts.map((post) => {
    const date = new Date(post.date);
    const valid = !Number.isNaN(date.getTime());
    return {
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      category: post.category ?? "",
      year: valid ? format(date, "yyyy") : "Undated",
      dateDisplay: valid ? format(date, "MMM dd") : "—",
      readDisplay: `${readingTime(post.content.replace(/<[^>]+>/g, " ")).minutes} min`,
    };
  });

  const years = new Set(entries.map((e) => e.year));

  return (
    <>
      {/* Masthead */}
      <div className="flex justify-between items-baseline font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-7">
        <span>Archive</span>
        <span>
          {entries.length} pieces · {years.size} year{years.size === 1 ? "" : "s"}
        </span>
      </div>

      {/* Hero */}
      <h1 className="font-fraunces font-light text-[56px] sm:text-[72px] md:text-[96px] tracking-[-0.035em] leading-[0.95] mb-5">
        Writing
      </h1>
      <p className="font-fraunces-italic italic font-light text-lg sm:text-[22px] leading-snug text-muted mb-12 sm:mb-16 max-w-[620px]">
        Notes on design, engineering, and the slow craft of making software
        that doesn&apos;t shout.
      </p>

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
