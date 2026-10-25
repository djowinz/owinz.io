import type { MetadataRoute } from "next";
import { getProjects, getWritingPosts } from "@/lib/content";
import { absoluteUrl, isoDate } from "@/lib/seo";

// Every page, rebuilt from content on each build; lastmod comes from the
// `updated` (or publish) date in frontmatter.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, projects] = await Promise.all([getWritingPosts(), getProjects()]);

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
  const latestProject = latest(projectEntries);

  return [
    { url: absoluteUrl("/"), lastModified: latest([...postEntries, ...projectEntries]) },
    { url: absoluteUrl("/writing"), lastModified: latestWriting },
    ...postEntries,
    { url: absoluteUrl("/projects"), lastModified: latestProject },
    ...projectEntries,
    { url: absoluteUrl("/talks") },
    { url: absoluteUrl("/contact") },
  ];
}
