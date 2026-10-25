import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import { readingTime } from "reading-time-estimator";
import { summarize } from "./seo";
import { normalizeDate, parseDate } from "./dates";

const contentDirectory = path.join(process.cwd(), "content");
const WRITING_DIR = path.join(contentDirectory, "writing");
const PROJECT_DIR = path.join(contentDirectory, "projects");
const TALKS_DIR = path.join(contentDirectory, "talks");
const WRITING_TYPE = "writing";
const PROJECT_TYPE = "projects";

export const CONTENT_TYPE = {
  writing: {
    type: WRITING_TYPE,
    dir: WRITING_DIR,
  },
  projects: {
    type: PROJECT_TYPE,
    dir: PROJECT_DIR,
  },
} as const;

export interface WritingPost {
  slug: string;
  title: string;
  /** Dek shown on the page; empty when the frontmatter has none. */
  excerpt: string;
  /** Meta description: the excerpt, or a summary of the opening paragraph. */
  description: string;
  date: string;
  /** Optional `updated` frontmatter, for dateModified / sitemap lastmod. */
  updated?: string;
  category?: string;
  tags: string[];
  /** Rendered HTML. */
  content: string;
  /** Raw markdown body (llms-full.txt). */
  markdown: string;
}

export type RecentPost = Pick<WritingPost, "title" | "slug" | "category"> & {
  date: Date;
  readTime: number;
  wordCount: number;
  readTimeDisplay: string;
};

export interface ProjectPost {
  slug: string;
  title: string;
  description: string;
  purpose: string;
  challenge: string;
  technologies: string[];
  category?: string;
  role?: string;
  status?: string;
  platform?: string;
  order: number;
  year?: string;
  liveUrl?: string;
  sourceUrl?: string;
  image?: string;
  content: string;
  markdown: string;
  launchDate?: string;
  updated?: string;
}

export type RecentProject = Pick<ProjectPost, "title" | "slug" | "category"> & {
  date: Date;
};

/** Sort key for a content date; missing/invalid dates sort last. */
function dateValue(raw: string | undefined): number {
  return parseDate(raw)?.getTime() ?? -Infinity;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}

async function markdownToHtml(markdown: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeHighlight)
    .use(rehypeStringify)
    .process(markdown);
  return result.toString();
}

async function parseWriting(
  slug: string,
  fileContents: string,
): Promise<WritingPost> {
  const { data, content } = matter(fileContents);
  const excerpt = data.excerpt || "";

  return {
    slug,
    title: data.title || "Untitled",
    excerpt,
    description: excerpt || summarize(content),
    date: normalizeDate(data.date),
    updated: normalizeDate(data.updated) || undefined,
    category: data.category,
    tags: stringList(data.tags),
    content: await markdownToHtml(content),
    markdown: content.trim(),
  };
}

export async function getWritingPosts(
  dir: string = WRITING_DIR,
): Promise<WritingPost[]> {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const fileNames = fs.readdirSync(dir);
  const posts = await Promise.all(
    fileNames
      .filter((fileName) => fileName.endsWith(".md"))
      .map((fileName) =>
        parseWriting(
          fileName.replace(/\.md$/, ""),
          fs.readFileSync(path.join(dir, fileName), "utf8"),
        ),
      ),
  );

  // Sort by date descending; undated posts last
  return posts.sort(
    (a, b) => dateValue(b.date) - dateValue(a.date),
  );
}

export async function getWritingPost(
  slug: string,
  dir: string = WRITING_DIR,
): Promise<WritingPost | null> {
  const fullPath = path.join(dir, `${slug}.md`);

  if (!fs.existsSync(fullPath)) {
    return null;
  }

  return parseWriting(slug, fs.readFileSync(fullPath, "utf8"));
}

async function parseProject(
  slug: string,
  fileContents: string,
): Promise<ProjectPost> {
  const { data, content } = matter(fileContents);
  const htmlContent = await markdownToHtml(content);
  const launchDate = normalizeDate(data.launchDate) || undefined;
  const launch = parseDate(launchDate);

  return {
    slug,
    title: data.title || "Untitled",
    description: data.description || summarize(content),
    purpose: data.purpose || "",
    challenge: data.challenge || "",
    technologies: stringList(data.technologies),
    category: data.category,
    role: data.role,
    status: data.status,
    platform: data.platform,
    order: typeof data.order === "number" ? data.order : 0,
    year: launch ? String(launch.getFullYear()) : undefined,
    liveUrl: data.liveUrl,
    sourceUrl: data.sourceUrl,
    image: data.image,
    content: htmlContent,
    markdown: content.trim(),
    launchDate,
    updated: normalizeDate(data.updated) || undefined,
  };
}

export async function getProjects(
  dir: string = PROJECT_DIR,
): Promise<ProjectPost[]> {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const fileNames = fs.readdirSync(dir);
  const projects = await Promise.all(
    fileNames
      .filter((fileName) => fileName.endsWith(".md"))
      .map((fileName) =>
        parseProject(
          fileName.replace(/\.md$/, ""),
          fs.readFileSync(path.join(dir, fileName), "utf8"),
        ),
      ),
  );

  return projects.sort((a, b) => a.order - b.order);
}

export async function getProject(
  slug: string,
  dir: string = PROJECT_DIR,
): Promise<ProjectPost | null> {
  const fullPath = path.join(dir, `${slug}.md`);

  if (!fs.existsSync(fullPath)) {
    return null;
  }

  return parseProject(slug, fs.readFileSync(fullPath, "utf8"));
}

export interface Talk {
  slug: string;
  title: string;
  date: string;
  venue?: string;
  format?: string;
  status?: string;
  links: { label: string; url: string }[];
}

export async function getTalks(
  now: Date = new Date(),
  dir: string = TALKS_DIR,
): Promise<{ upcoming: Talk[]; past: Talk[] }> {
  if (!fs.existsSync(dir)) {
    return { upcoming: [], past: [] };
  }

  const talks = fs
    .readdirSync(dir)
    .filter((fileName) => fileName.endsWith(".md"))
    .map((fileName) => {
      const { data } = matter(
        fs.readFileSync(path.join(dir, fileName), "utf8"),
      );
      const links = Object.entries(
        (data.links ?? {}) as Record<string, string>,
      ).map(([key, url]) => ({
        label: key.charAt(0).toUpperCase() + key.slice(1),
        url,
      }));
      return {
        slug: fileName.replace(/\.md$/, ""),
        title: data.title || "Untitled",
        date: normalizeDate(data.date),
        venue: data.venue,
        format: data.format,
        status: data.status,
        upcoming: typeof data.upcoming === "boolean" ? data.upcoming : undefined,
        links,
      };
    });

  const isUpcoming = (t: (typeof talks)[number]) =>
    t.upcoming ?? dateValue(t.date) >= now.getTime();

  const byDateDesc = (a: Talk, b: Talk) =>
    dateValue(b.date) - dateValue(a.date);

  const strip = (t: Talk & { upcoming?: boolean }): Talk => {
    const { slug, title, date, venue, format, status, links } = t;
    return { slug, title, date, venue, format, status, links };
  };

  return {
    upcoming: talks
      .filter(isUpcoming)
      .map(strip)
      .sort((a, b) => -byDateDesc(a, b)),
    past: talks
      .filter((t) => !isUpcoming(t))
      .map(strip)
      .sort(byDateDesc),
  };
}

export async function getRecentContent(
  limit = 5,
  content: keyof typeof CONTENT_TYPE,
  dir: string = CONTENT_TYPE[content].dir,
): Promise<RecentPost[] | RecentProject[]> {
  const type = CONTENT_TYPE[content].type;
  if (!fs.existsSync(dir)) {
    return [];
  }

  const fileNames = fs.readdirSync(dir);
  const collection = await Promise.all(
    fileNames
      .filter((fileName) => fileName.endsWith(".md"))
      .map((fileName) => {
        const fullPath = path.join(dir, fileName);
      const fileContents = fs.readFileSync(fullPath, "utf8");
      const { data, content } = matter(fileContents);

      const baseObject = {
        title: data.title || "Untitled",
        slug: fileName.replace(/\.md$/, ""),
        category: data.category || "",
      };

      if (type === WRITING_TYPE) {
        const timeOutput = readingTime(content);
        return {
          ...baseObject,
          date: parseDate(normalizeDate(data.date)) ?? new Date(NaN),
          readTime: timeOutput.minutes,
          wordCount: timeOutput.words,
          readTimeDisplay: timeOutput.text,
        } as RecentPost;
      }

      return {
        ...baseObject,
        date: parseDate(normalizeDate(data.launchDate)) ?? new Date(NaN),
      } as RecentProject;
    }),
  );

  // sort newest-first (undated last) & limit
  const time = (d: Date) => (Number.isNaN(d.getTime()) ? -Infinity : d.getTime());
  collection.sort((a, b) => time(b.date) - time(a.date));
  return collection.slice(0, limit);
}
