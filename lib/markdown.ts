import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";

const contentDirectory = path.join(process.cwd(), "content");

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  category?: string;
  content: string;
}

export interface PortfolioProject {
  slug: string;
  title: string;
  description: string;
  purpose: string;
  challenge: string;
  technologies: string[];
  liveUrl?: string;
  sourceUrl?: string;
  image?: string;
  content: string;
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

export async function getBlogPosts(): Promise<BlogPost[]> {
  const blogDir = path.join(contentDirectory, "blog");

  if (!fs.existsSync(blogDir)) {
    return [];
  }

  const fileNames = fs.readdirSync(blogDir);
  const posts = await Promise.all(
    fileNames
      .filter((fileName) => fileName.endsWith(".md"))
      .map(async (fileName) => {
        const slug = fileName.replace(/\.md$/, "");
        const fullPath = path.join(blogDir, fileName);
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

  // Sort by date descending
  return posts.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateB.getTime() - dateA.getTime();
  });
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const fullPath = path.join(contentDirectory, "blog", `${slug}.md`);

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

export async function getPortfolioProjects(): Promise<PortfolioProject[]> {
  const portfolioDir = path.join(contentDirectory, "portfolio");

  if (!fs.existsSync(portfolioDir)) {
    return [];
  }

  const fileNames = fs.readdirSync(portfolioDir);
  const projects = await Promise.all(
    fileNames
      .filter((fileName) => fileName.endsWith(".md"))
      .map(async (fileName) => {
        const slug = fileName.replace(/\.md$/, "");
        const fullPath = path.join(portfolioDir, fileName);
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

export async function getPortfolioProject(
  slug: string,
): Promise<PortfolioProject | null> {
  const fullPath = path.join(contentDirectory, "portfolio", `${slug}.md`);

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
