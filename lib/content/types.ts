// Shapes the site renders. Both content sources (the database in production,
// Markdown files for the one-time import and tests) produce these.

/** A category or tag as the site links to it. */
export interface TermRef {
  name: string;
  slug: string;
}

/** A category or tag with how many live posts use it. */
export interface TermSummary extends TermRef {
  count: number;
  /** Categories only: intro and meta description of its page. */
  description: string;
}

export interface WritingPost {
  slug: string;
  title: string;
  /** Dek shown on the page; empty when none was written. */
  excerpt: string;
  /** Meta description: the excerpt, or a summary of the opening paragraph. */
  description: string;
  /** Calendar date, "YYYY-MM-DD" (files may also use "March 15, 2026"). */
  date: string;
  /** Last substantive revision, for dateModified / sitemap lastmod. */
  updated?: string;
  category?: string;
  tags: string[];
  /** The category and tags with their slugs, for /writing/category|tag/<slug>/. */
  categoryRef?: TermRef;
  tagRefs: TermRef[];
  /** Byline shown to readers: the post's byline, or the site owner. */
  author: string;
  /** Rendered HTML. */
  content: string;
  /** Markdown body (llms-full.txt), with local image paths made absolute. */
  markdown: string;
  /** File names of the local photos the post shows, at /writing/<slug>/<name>. */
  images: string[];
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
  /** The category and technologies with their slugs, for /projects/category|technology/<slug>/. */
  categoryRef?: TermRef;
  technologyRefs: TermRef[];
  role?: string;
  status?: string;
  platform?: string;
  order: number;
  year?: string;
  liveUrl?: string;
  sourceUrl?: string;
  /** Cover image URL: one of the project's photos (/projects/<slug>/<name>?v=…) or an external URL. */
  image?: string;
  content: string;
  /** Markdown body (llms-full.txt), with local image paths made absolute. */
  markdown: string;
  /** File names of the local photos the project shows (body and cover), at /projects/<slug>/<name>. */
  images: string[];
  launchDate?: string;
  updated?: string;
}

export type RecentProject = Pick<ProjectPost, "title" | "slug" | "category"> & {
  date: Date;
};

export interface Talk {
  slug: string;
  title: string;
  date: string;
  venue?: string;
  format?: string;
  status?: string;
  links: { label: string; url: string }[];
}

export const CONTENT_TYPE = {
  writing: { type: "writing" },
  projects: { type: "projects" },
} as const;

export type ContentType = keyof typeof CONTENT_TYPE;
