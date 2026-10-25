import type { MetadataRoute } from "next";
import { getProjects, getWritingPosts, getWritingTaxonomy } from "@/lib/content";
import { absoluteUrl, isoDate } from "@/lib/seo";

// Every indexable page, rebuilt from content whenever it's published; lastmod
// comes from each post's `updated` (or publish) date. Category pages are
// listed; tag pages are noindex and left out.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, projects, { categories }] = await Promise.all([getWritingPosts(), getProjects(), getWritingTaxonomy()]);

  const postEntries = posts.map((post) => ({
    url: absoluteUrl(`/writing/${post.slug}`),
    lastModified: isoDate(post.updated) ?? isoDate(post.date),
  }));
  const projectEntries = projects.map((project) => ({
    url: absoluteUrl(`/projects/${project.slug}`),
    lastModified: isoDate(project.updated) ?? isoDate(project.launchDate),
  }));

  const latest = (entries: { lastModified?: string }[]) =>
    entries.map((e) => e.lastModified).filter(Boolean).sort().at(-1);
  const latestWriting = latest(postEntries);
  const categoryEntries = categories.map((category) => ({
    url: absoluteUrl(`/writing/category/${category.slug}`),
    lastModified: latest(
      posts
        .filter((p) => p.categoryRef?.slug === category.slug)
        .map((p) => ({ lastModified: isoDate(p.updated) ?? isoDate(p.date) })),
    ),
  }));
  const latestProject = latest(projectEntries);

  return [
    { url: absoluteUrl("/"), lastModified: latest([...postEntries, ...projectEntries]) },
    { url: absoluteUrl("/writing"), lastModified: latestWriting },
    ...categoryEntries,
    ...postEntries,
    { url: absoluteUrl("/projects"), lastModified: latestProject },
    ...projectEntries,
    { url: absoluteUrl("/talks") },
    { url: absoluteUrl("/contact") },
  ];
}
