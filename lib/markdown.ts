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

const contentDirectory = path.join(process.cwd(), "content");
const WRITING_DIR = path.join(contentDirectory, "writing");
const PROJECT_DIR = path.join(contentDirectory, "projects");
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
  excerpt: string;
  date: string;
  category?: string;
  content: string;
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
  liveUrl?: string;
  sourceUrl?: string;
  image?: string;
  content: string;
  launchDate?: string;
}

export type RecentProject = Pick<ProjectPost, "title" | "slug" | "category"> & {
  date: Date;
};

function dateValue(d: Date): number {
  const t = d.getTime();
  return Number.isNaN(t) ? -Infinity : t;
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
      .map(async (fileName) => {
        const slug = fileName.replace(/\.md$/, "");
        const fullPath = path.join(dir, fileName);
        const fileContents = fs.readFileSync(fullPath, "utf8");
        const { data, content } = matter(fileContents);
        const htmlContent = await markdownToHtml(content);

        return {
          slug,
          title: data.title || "Untitled",
          excerpt: data.excerpt || "",
          date: data.date || "",
          category: data.category,
          content: htmlContent,
        };
      }),
  );

  // Sort by date descending; undated posts last
  return posts.sort(
    (a, b) => dateValue(new Date(b.date)) - dateValue(new Date(a.date)),
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

  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);
  const htmlContent = await markdownToHtml(content);

  return {
    slug,
    title: data.title || "Untitled",
    excerpt: data.excerpt || "",
    date: data.date || "",
    category: data.category,
    content: htmlContent,
  };
}

export async function getProjects(): Promise<ProjectPost[]> {
  if (!fs.existsSync(PROJECT_DIR)) {
    return [];
  }

  const fileNames = fs.readdirSync(PROJECT_DIR);
  const projects = await Promise.all(
    fileNames
      .filter((fileName) => fileName.endsWith(".md"))
      .map(async (fileName) => {
        const slug = fileName.replace(/\.md$/, "");
        const fullPath = path.join(PROJECT_DIR, fileName);
        const fileContents = fs.readFileSync(fullPath, "utf8");
        const { data, content } = matter(fileContents);
        const htmlContent = await markdownToHtml(content);

        return {
          slug,
          title: data.title || "Untitled",
          description: data.description || "",
          purpose: data.purpose || "",
          challenge: data.challenge || "",
          technologies: data.technologies || [],
          liveUrl: data.liveUrl,
          sourceUrl: data.sourceUrl,
          image: data.image,
          content: htmlContent,
        };
      }),
  );

  return projects;
}

export async function getProject(slug: string): Promise<ProjectPost | null> {
  const fullPath = path.join(PROJECT_DIR, `${slug}.md`);

  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);
  const htmlContent = await markdownToHtml(content);

  return {
    slug,
    title: data.title || "Untitled",
    description: data.description || "",
    purpose: data.purpose || "",
    challenge: data.challenge || "",
    technologies: data.technologies || [],
    liveUrl: data.liveUrl,
    sourceUrl: data.sourceUrl,
    image: data.image,
    content: htmlContent,
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
          date: new Date(data.date),
          readTime: timeOutput.minutes,
          wordCount: timeOutput.words,
          readTimeDisplay: timeOutput.text,
        } as RecentPost;
      }

      return {
        ...baseObject,
        date: new Date(data.launchDate),
      } as RecentProject;
    }),
  );

  // sort newest-first (undated last) & limit
  collection.sort((a, b) => dateValue(b.date) - dateValue(a.date));
  return collection.slice(0, limit);
}
