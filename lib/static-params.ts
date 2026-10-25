// With Cache Components, a dynamic route's generateStaticParams must return
// at least one entry (Next.js uses it to validate the route at build time).
// A fresh database has no content yet, so fall back to a placeholder the
// pages answer with notFound(). Content published later renders on first
// request and is cached from then on.
export const PLACEHOLDER_SLUG = "__placeholder__";

export function withPlaceholder<T extends { slug: string }>(
  params: T[],
  placeholder: Omit<T, "slug"> = {} as Omit<T, "slug">,
): T[] {
  return params.length > 0 ? params : [{ ...placeholder, slug: PLACEHOLDER_SLUG } as T];
}
