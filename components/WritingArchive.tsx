"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface ArchiveEntry {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  year: string;
  dateDisplay: string;
  readDisplay: string;
}

export default function WritingArchive({ entries }: { entries: ArchiveEntry[] }) {
  const [active, setActive] = useState("All");

  const categories = useMemo(() => {
    const unique = Array.from(
      new Set(entries.map((e) => e.category).filter(Boolean)),
    );
    return ["All", ...unique];
  }, [entries]);

  const visible =
    active === "All" ? entries : entries.filter((e) => e.category === active);

  const years = useMemo(() => {
    const grouped = new Map<string, ArchiveEntry[]>();
    for (const entry of visible) {
      const group = grouped.get(entry.year) ?? [];
      group.push(entry);
      grouped.set(entry.year, group);
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [visible]);

  return (
    <>
      {/* Tag filter row */}
      <div className="flex flex-wrap gap-3 mb-14 font-mono text-[11px] tracking-[0.7px]">
        {categories.map((category) => {
          const isActive = category === active;
          return (
            <button
              key={category}
              onClick={() => setActive(category)}
              className={`px-3 py-1.5 border transition-colors cursor-none ${
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-edge text-muted hover:border-foreground"
              }`}
            >
              {category}
            </button>
          );
        })}
      </div>

      {/* Year sections */}
      {years.map(([year, posts]) => (
        <section key={year} className="mb-14">
          <div className="grid grid-cols-[80px_1fr] gap-6 items-baseline border-t border-foreground pt-5 mb-2">
            <h2 className="font-fraunces font-light text-[56px] tracking-[-1.68px] leading-none">
              {year}
            </h2>
            <div className="font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] text-right">
              {posts.length} piece{posts.length === 1 ? "" : "s"}
            </div>
          </div>
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/writing/${post.slug}`}
              className="grid grid-cols-[80px_1fr_90px] gap-6 items-start py-6 border-t border-edge last:border-b cursor-none transition-colors hover:bg-accent/5"
            >
              <div className="font-mono text-muted text-[11px] tracking-[0.7px] pt-1.5">
                {post.dateDisplay}
              </div>
              <div>
                <div className="flex gap-3 items-baseline mb-2">
                  <h3 className="font-fraunces text-2xl tracking-[-0.36px] leading-tight">
                    {post.title}
                  </h3>
                  {post.category && (
                    <span className="font-mono uppercase text-accent text-[9px] tracking-[1.1px] whitespace-nowrap border border-edge px-1.5 py-0.5">
                      {post.category}
                    </span>
                  )}
                </div>
                {post.excerpt && (
                  <p className="text-sm leading-relaxed text-muted max-w-[520px]">
                    {post.excerpt}
                  </p>
                )}
              </div>
              <div className="font-mono text-muted text-[10px] tracking-[0.6px] text-right pt-2">
                {post.readDisplay} →
              </div>
            </Link>
          ))}
        </section>
      ))}
    </>
  );
}
