// Dynamic public routes (/writing/[slug], /writing/category/[slug], …) follow
// one pattern so that known URLs are prerendered and unknown ones get a real
// HTTP 404 on their very first request:
//
//   export const ensureStatic = "navigation";       // in page.tsx
//   export const instant = false;
//   export async function generateStaticParams() {
//     return withPlaceholder((await getThings()).map((t) => ({ slug: t.slug })));
//   }
//   export default async function Page({ params }) {
//     const thing = found(await getThing((await params).slug)); // "use cache" getter
//     …
//   }
//
// Why: with Cache Components + Partial Prefetching, a URL that
// generateStaticParams didn't list is answered with the route's prerendered
// fallback shell, which starts streaming (and so commits to 200 OK) before
// the page runs notFound(). `ensureStatic = "navigation"` makes Next.js wait
// for the complete static render of that URL instead, so notFound() runs
// before any byte is sent and the status is 404. Known URLs are unaffected
// (still fully prerendered), and the result for an unknown URL is cached like
// any other page until its tag is refreshed. The cost: every data read on the
// route must be cached ("use cache"), which Next.js checks at build time.
//
// `params` is awaited at the top of the page, not inside <Suspense>: in a
// Suspense child the prerendered content would arrive as an out-of-order
// segment (a hidden div swapped in by a script), which crawlers that don't
// run JavaScript can miss. `instant = false` opts these pages out of the
// dev-only "encountered URL data" check that pattern would otherwise trip;
// they're prerendered per slug, so navigating to them is fast anyway.
//
// Segment config must be a literal in the page file (Next.js reads it
// statically), so it can't be exported from here.

// With Cache Components, a dynamic route's generateStaticParams must return
// at least one entry (Next.js uses it to validate the route at build time).
// A fresh database has no content yet, so fall back to a placeholder the
// pages answer with notFound(). Content published later renders on first
// request and is cached from then on.
import { notFound } from "next/navigation";

export const PLACEHOLDER_SLUG = "__placeholder__";

export function withPlaceholder<T extends { slug: string }>(
  params: T[],
  placeholder: Omit<T, "slug"> = {} as Omit<T, "slug">,
): T[] {
  return params.length > 0 ? params : [{ ...placeholder, slug: PLACEHOLDER_SLUG } as T];
}

/**
 * The value, or a 404. Call it in the page body, outside any <Suspense>.
 */
export function found<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) notFound();
  return value;
}
