// Turns stored content (frontmatter fields + Markdown body) into what the
// site renders. Pure apart from image lookups, so both content sources share it.
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import { readingTime } from "reading-time-estimator";
import { normalizeDate, parseDate } from "../dates";
import { isLocalImage, rehypeArticleImages, type ImageResolver } from "../rehype-images";
import { summarize } from "../seo";
import { SITE } from "../site";
import type { ProjectPost, RecentPost, RecentProject, Talk, TermRef, WritingPost } from "./types";

export type { ImageResolver } from "../rehype-images";

export async function markdownToHtml(
  markdown: string,
  options: { resolve?: ImageResolver; used?: Set<string> } = {},
): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeArticleImages, options)
    .use(rehypeHighlight)
    .use(rehypeStringify)
    .process(markdown);
  return result.toString();
}

/** Sort key for a content date; missing or invalid dates sort last. */
export function dateValue(raw: string | undefined): number {
  return parseDate(raw)?.getTime() ?? -Infinity;
}

export const newestFirst = <T extends { date: string }>(a: T, b: T) =>
  dateValue(b.date) - dateValue(a.date);

// `![alt](photo.jpg)` → `![alt](https://owinz.io/writing/<slug>/photo.jpg)`
const LOCAL_IMAGE = /(!\[[^\]]*\]\()(?:\.\/)?(?![a-z][a-z\d+.-]*:|\/|#)/gi;

export interface WritingSource {
  slug: string;
  title: string;
  excerpt?: string;
  date: string;
  updated?: string | null;
  category?: TermRef | null;
  tags?: TermRef[];
  /** Author shown to readers; empty means the site owner. */
  byline?: string | null;
  body: string;
}

export async function buildWritingPost(
  source: WritingSource,
  resolve?: ImageResolver,
): Promise<WritingPost> {
  const body = source.body.trim();
  const used = new Set<string>();
  const content = await markdownToHtml(body, { resolve, used });
  const excerpt = source.excerpt ?? "";
  return {
    slug: source.slug,
    title: source.title || "Untitled",
    excerpt,
    description: excerpt || summarize(body),
    date: normalizeDate(source.date),
    updated: normalizeDate(source.updated) || undefined,
    category: source.category?.name || undefined,
    tags: (source.tags ?? []).map((t) => t.name),
    categoryRef: source.category ?? undefined,
    tagRefs: source.tags ?? [],
    author: source.byline?.trim() || SITE.name,
    content,
    markdown: body.replace(LOCAL_IMAGE, `$1${SITE.url}/writing/${source.slug}/`),
    images: [...used],
  };
}

export interface ProjectSource {
  slug: string;
  title: string;
  description?: string;
  purpose?: string;
  challenge?: string;
  technologies?: TermRef[];
  category?: TermRef | null;
  role?: string | null;
  status?: string | null;
  platform?: string | null;
  order?: number;
  launchDate?: string | null;
  updated?: string | null;
  liveUrl?: string | null;
  sourceUrl?: string | null;
  /** Cover image: a file name of one of the project's photos, or a URL. */
  image?: string | null;
  body: string;
}

export async function buildProject(source: ProjectSource, resolve?: ImageResolver): Promise<ProjectPost> {
  const body = source.body.trim();
  const launchDate = normalizeDate(source.launchDate) || undefined;
  const launch = parseDate(launchDate);
  const used = new Set<string>();
  const content = await markdownToHtml(body, { resolve, used });
  // A cover that's one of the project's own photos resolves like a body photo;
  // a URL or site path is used as is. A missing photo shows no cover.
  let image: string | undefined;
  const cover = source.image?.trim();
  if (cover && isLocalImage(cover)) {
    const resolved = await resolve?.(cover.replace(/^\.\//, ""));
    if (resolved) {
      image = resolved.src;
      used.add(cover.replace(/^\.\//, ""));
    }
  } else if (cover) {
    image = cover;
  }
  return {
    slug: source.slug,
    title: source.title || "Untitled",
    description: source.description || summarize(body),
    purpose: source.purpose ?? "",
    challenge: source.challenge ?? "",
    technologies: (source.technologies ?? []).map((t) => t.name),
    category: source.category?.name || undefined,
    categoryRef: source.category ?? undefined,
    technologyRefs: source.technologies ?? [],
    role: source.role || undefined,
    status: source.status || undefined,
    platform: source.platform || undefined,
    order: source.order ?? 0,
    year: launch ? String(launch.getFullYear()) : undefined,
    liveUrl: source.liveUrl || undefined,
    sourceUrl: source.sourceUrl || undefined,
    image,
    content,
    markdown: body.replace(LOCAL_IMAGE, `$1${SITE.url}/projects/${source.slug}/`),
    images: [...used],
    launchDate,
    updated: normalizeDate(source.updated) || undefined,
  };
}

export interface TalkSource extends Talk {
  /** Overrides the date when set: true/false forces upcoming/past. */
  upcoming?: boolean | null;
}

export function splitTalks(
  talks: TalkSource[],
  now: Date,
): { upcoming: Talk[]; past: Talk[] } {
  const isUpcoming = (t: TalkSource) => t.upcoming ?? dateValue(t.date) >= now.getTime();
  const strip = ({ slug, title, date, venue, format, status, links }: TalkSource): Talk => ({
    slug,
    title,
    date: normalizeDate(date),
    venue: venue || undefined,
    format: format || undefined,
    status: status || undefined,
    links,
  });
  return {
    upcoming: talks.filter(isUpcoming).sort((a, b) => -newestFirst(a, b)).map(strip),
    past: talks.filter((t) => !isUpcoming(t)).sort(newestFirst).map(strip),
  };
}

const time = (d: Date) => (Number.isNaN(d.getTime()) ? -Infinity : d.getTime());

export function recentPosts(posts: WritingPost[], limit: number): RecentPost[] {
  return posts
    .map((post) => {
      const read = readingTime(post.markdown);
      return {
        title: post.title,
        slug: post.slug,
        category: post.category ?? "",
        date: parseDate(post.date) ?? new Date(NaN),
        readTime: read.minutes,
        wordCount: read.words,
        readTimeDisplay: read.text,
      };
    })
    .sort((a, b) => time(b.date) - time(a.date))
    .slice(0, limit);
}

export function recentProjects(projects: ProjectPost[], limit: number): RecentProject[] {
  return projects
    .map((project) => ({
      title: project.title,
      slug: project.slug,
      category: project.category ?? "",
      date: parseDate(project.launchDate) ?? new Date(NaN),
    }))
    .sort((a, b) => time(b.date) - time(a.date))
    .slice(0, limit);
}
