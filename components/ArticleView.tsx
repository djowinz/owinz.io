// The article as readers see it. Shared by the live page
// (app/(site)/writing/[slug]) and the CMS draft preview
// (app/admin/preview/writing/[id]), so the preview can't drift from the site.
import { format } from "date-fns";
import Link from "next/link";
import ArticleHtml from "@/components/ArticleHtml";
import { readingTime } from "reading-time-estimator";
import { JsonLd } from "@/components/JsonLd";
import type { WritingPost } from "@/lib/content/types";
import { parseDate } from "@/lib/dates";
import { blogPostingSchema, breadcrumbSchema } from "@/lib/schema";
import { isoDate } from "@/lib/seo";
import { SITE } from "@/lib/site";

function formatDate(raw: string, pattern: string): string | null {
  const date = parseDate(raw);
  return date ? format(date, pattern) : null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

export function ArticleView({ post, readNext }: { post: WritingPost; readNext: WritingPost[] }) {
  const dateDisplay = formatDate(post.date, "d MMMM yyyy");
  const read = readingTime(stripHtml(post.content));

  const published = isoDate(post.date);
  const updated = isoDate(post.updated);
  const updatedDisplay =
    updated && updated !== published ? formatDate(updated, "d MMMM yyyy") : null;

  return (
    <article className="max-w-[680px] mx-auto">
      <JsonLd
        data={[
          blogPostingSchema(post, read.words),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Writing", path: "/writing" },
            { name: post.title, path: `/writing/${post.slug}` },
          ]),
        ]}
      />
      {/* Back link */}
      <Link
        href="/writing"
        className="inline-flex gap-2 items-center font-mono uppercase text-muted text-[11px] tracking-[1.3px] mb-10 sm:mb-12 cursor-none transition-colors hover:text-accent"
      >
        <span>←</span>
        <span>All writing</span>
      </Link>

      <header>
        {/* Meta row */}
        <div className="flex flex-wrap gap-x-3 sm:gap-x-5 gap-y-2 font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-6">
          {[
            post.categoryRef && (
              <Link
                key="category"
                href={`/writing/category/${post.categoryRef.slug}`}
                className="cursor-none transition-colors hover:text-accent"
              >
                {post.categoryRef.name}
              </Link>
            ),
            dateDisplay && (
              <time key="date" dateTime={published}>
                {dateDisplay}
              </time>
            ),
            updatedDisplay && (
              <span key="updated">
                Updated <time dateTime={updated}>{updatedDisplay}</time>
              </span>
            ),
            <span key="read">{read.minutes} min read</span>,
          ]
            .filter(Boolean)
            .map((part, i) => (
              <span key={i} className="flex gap-3 sm:gap-5">
                {i > 0 && <span aria-hidden>/</span>}
                {part}
              </span>
            ))}
        </div>

        {/* Title + dek */}
        <h1 className="font-fraunces font-light text-[40px] sm:text-[52px] md:text-[64px] tracking-[-0.03em] leading-[1.02] mb-5">
          {post.title}
        </h1>
        {post.excerpt && (
          <p className="font-fraunces-italic italic font-light text-lg sm:text-[22px] leading-snug text-muted mb-10 sm:mb-12">
            {post.excerpt}
          </p>
        )}

        {/* Byline strip */}
        <div className="flex justify-between items-center pb-6 mb-10 border-b border-edge">
          <div>
            {post.author === SITE.name ? (
              <Link
                href="/"
                rel="author"
                className="block text-[13px] cursor-none transition-colors hover:text-accent"
              >
                {post.author}
              </Link>
            ) : (
              <span className="block text-[13px]">{post.author}</span>
            )}
            {post.category && (
              <div className="font-mono uppercase text-muted text-[10px] tracking-[1.2px]">
                {post.category}
              </div>
            )}
          </div>
          <Link
            href="/feed.xml"
            className="font-mono uppercase text-muted text-[10px] tracking-[1.3px] cursor-none transition-colors hover:text-accent"
          >
            RSS
          </Link>
        </div>
      </header>

      {/* Body */}
      <ArticleHtml className="prose" html={post.content} />

      {/* Footer meta */}
      <div className="mt-16 pt-6 border-t border-edge flex flex-wrap gap-4 justify-between items-center font-mono text-[11px] tracking-[0.7px] text-muted">
        <span>
          {post.categoryRef ? (
            <>
              Filed under:{" "}
              <Link href={`/writing/category/${post.categoryRef.slug}`} className="cursor-none transition-colors hover:text-accent">
                {post.categoryRef.name}
              </Link>
            </>
          ) : (
            " "
          )}
        </span>
        <span>/ END /</span>
        {post.tagRefs.length > 0 && (
          <ul aria-label="Tags" className="basis-full flex flex-wrap gap-x-4 gap-y-1">
            {post.tagRefs.map((tag) => (
              <li key={tag.slug}>
                <Link href={`/writing/tag/${tag.slug}`} className="cursor-none transition-colors hover:text-accent">
                  #{tag.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Read next */}
      {readNext.length > 0 && (
        <aside>
          <section className="mt-14 sm:mt-18">
            <h2 className="font-fraunces-italic italic font-medium text-[22px] tracking-[-0.22px] mb-5 pb-3.5 border-b border-edge">
              Read next
            </h2>
            {readNext.map((next) => {
              const nextDate = formatDate(next.date, "MMM dd, yyyy");
              const nextRead = readingTime(stripHtml(next.content));
              return (
                <Link
                  key={next.slug}
                  href={`/writing/${next.slug}`}
                  className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 sm:grid-cols-[100px_1fr_80px] sm:gap-6 py-5 border-b border-edge cursor-none transition-colors hover:bg-accent/5"
                >
                  <div className="font-mono text-muted text-[11px] tracking-[0.7px]">
                    {nextDate ?? "—"}
                  </div>
                  <div className="order-last col-span-full sm:order-none sm:col-span-1 font-fraunces text-xl tracking-[-0.2px] leading-tight">
                    {next.title}
                  </div>
                  <div className="font-mono text-muted text-[10px] tracking-[0.6px] text-right">
                    {nextRead.minutes} min →
                  </div>
                </Link>
              );
            })}
          </section>
        </aside>
      )}
    </article>
  );
}
