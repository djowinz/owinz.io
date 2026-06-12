# Portfolio Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete owinz.io to match the "Direction A — Warm Editorial" mockups, with all content as Markdown + frontmatter, exported statically for S3.

**Architecture:** Extend the existing gray-matter + unified content layer in `lib/markdown.ts` (three collections: writing, projects, talks). Each route is a server component reading markdown at build time; the writing archive's tag filter is the one client component. `output: "export"` pre-renders everything, including `feed.xml` via a static route handler.

**Tech Stack:** Next.js 16 (App Router, static export), Tailwind v4, gray-matter, unified/remark/rehype, vitest (new, dev-only).

**Spec:** `docs/superpowers/specs/2026-06-12-portfolio-completion-design.md`

**Conventions used throughout:**
- This Next version: `params` is a `Promise` in pages/`generateMetadata`; dynamic routes need `generateStaticParams` under static export; route handlers render statically for `GET`.
- Page idiom follows `app/page.tsx`: mono masthead `font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px]`, Fraunces display headings, `border-edge` hairlines, `cursor-none` on links.
- All shell commands run from repo root with pnpm.

---

### Task 0: Baseline commit

The working tree has uncommitted WIP (modified pages, new `content/`, deleted `components/Menu.tsx`). Commit it so every later diff is reviewable.

**Files:** all currently modified/untracked.

- [ ] **Step 1: Commit current state**

```bash
git add -A
git commit -m "WIP baseline: markdown content layer, home page, page stubs"
```

---

### Task 1: Test infrastructure (vitest)

**Files:**
- Modify: `package.json` (add devDep + script)
- Create: `tests/markdown.test.ts` (smoke test only; real tests come in Tasks 2–4)

- [ ] **Step 1: Install vitest**

```bash
pnpm add -D vitest
```

- [ ] **Step 2: Add test script to `package.json` scripts**

```json
"test": "vitest run"
```

- [ ] **Step 3: Write a smoke test importing the real module**

```ts
// tests/markdown.test.ts
import { describe, it, expect } from "vitest";
import { getWritingPosts } from "../lib/markdown";

describe("content layer", () => {
  it("loads writing posts from content/writing", async () => {
    const posts = await getWritingPosts();
    expect(posts.length).toBeGreaterThan(0);
    expect(posts[0].title).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `pnpm test`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml tests/markdown.test.ts
git commit -m "test: add vitest with content-layer smoke test"
```

---

### Task 2: Content layer fixes (sort bug, .md filter, fixture support)

`getRecentContent` currently sorts oldest-first (`compareAsc`) and reads non-`.md` files. Loaders get an optional `dir` param so tests can point at fixtures.

**Files:**
- Modify: `lib/markdown.ts`
- Create: `tests/fixtures/content/writing/older.md`, `tests/fixtures/content/writing/newer.md`, `tests/fixtures/content/writing/minimal.md`, `tests/fixtures/content/writing/notes.txt`
- Modify: `tests/markdown.test.ts`

- [ ] **Step 1: Create fixtures**

```markdown
<!-- tests/fixtures/content/writing/older.md -->
---
title: "Older Post"
excerpt: "The older one"
date: "January 5, 2025"
category: "Essay"
---
Old body text for the older post.
```

```markdown
<!-- tests/fixtures/content/writing/newer.md -->
---
title: "Newer Post"
excerpt: "The newer one"
date: "March 20, 2026"
category: "Technical"
---
New body text for the newer post.
```

```markdown
<!-- tests/fixtures/content/writing/minimal.md -->
---
title: "Minimal Post"
---
Only a title, nothing else.
```

```text
tests/fixtures/content/writing/notes.txt
not markdown, must be ignored
```

- [ ] **Step 2: Write failing tests**

```ts
// append to tests/markdown.test.ts
import path from "path";
import { getRecentContent, getWritingPost } from "../lib/markdown";

const FIXTURE_WRITING = path.join(__dirname, "fixtures", "content", "writing");

describe("getRecentContent", () => {
  it("returns newest first, undated last, and ignores non-md files", async () => {
    const recent = await getRecentContent(5, "writing", FIXTURE_WRITING);
    // Invalid/missing dates sort last (NaN time treated as -Infinity).
    expect(recent.map((r) => r.title)).toEqual([
      "Newer Post",
      "Older Post",
      "Minimal Post",
    ]);
    expect(recent.some((r) => r.title === "Untitled")).toBe(false); // .txt ignored
  });

  it("respects the limit", async () => {
    const recent = await getRecentContent(1, "writing", FIXTURE_WRITING);
    expect(recent).toHaveLength(1);
  });
});

describe("minimal frontmatter", () => {
  it("loads a post with only a title without crashing", async () => {
    const post = await getWritingPost("minimal", FIXTURE_WRITING);
    expect(post?.title).toBe("Minimal Post");
    expect(post?.excerpt).toBe("");
  });
});
```

- [ ] **Step 3: Run tests, expect FAIL** (wrong order; `.txt` crashes `new Date(undefined)` / appears as Untitled; loaders don't take a dir param)

Run: `pnpm test`

- [ ] **Step 4: Implement in `lib/markdown.ts`**

- Add optional `dir` params: `getWritingPosts(dir = WRITING_DIR)`, `getWritingPost(slug, dir = WRITING_DIR)`, `getProjects(dir = PROJECT_DIR)`, `getProject(slug, dir = PROJECT_DIR)`, `getRecentContent(limit, content, dir = CONTENT_TYPE[content].dir)`.
- In `getRecentContent`: filter `fileName.endsWith(".md")`; sort with a safe-descending comparator instead of `compareAsc`:

```ts
function dateValue(d: Date): number {
  const t = d.getTime();
  return Number.isNaN(t) ? -Infinity : t;
}
// ...
collection.sort((a, b) => dateValue(b.date) - dateValue(a.date));
return collection.slice(0, limit);
```

(Remove the now-unused `compareAsc`/`compareDesc` imports.)

- [ ] **Step 5: Run tests, expect PASS**

Run: `pnpm test`

- [ ] **Step 6: Commit**

```bash
git add lib/markdown.ts tests/
git commit -m "fix: recent content sorts newest-first, ignores non-markdown files"
```

---

### Task 3: Extended project schema

Add `role`, `status`, `platform`, `order` to projects; derive `year` from `launchDate`; sort the index by `order`. Update the four sample project files.

**Files:**
- Modify: `lib/markdown.ts` (ProjectPost interface + loaders)
- Modify: `content/projects/chronicle.md`, `mindful.md`, `palette.md`, `syntax.md`
- Create: `tests/fixtures/content/projects/alpha.md`, `tests/fixtures/content/projects/beta.md`
- Modify: `tests/markdown.test.ts`

- [ ] **Step 1: Fixtures**

```markdown
<!-- tests/fixtures/content/projects/alpha.md -->
---
title: "Alpha"
description: "First project"
technologies: [React]
category: "Tooling"
role: "Solo project"
status: "Shipped"
platform: "Web"
order: 1
launchDate: "March 15, 2024"
---
Alpha body.
```

```markdown
<!-- tests/fixtures/content/projects/beta.md -->
---
title: "Beta"
description: "Second project"
order: 2
launchDate: "June 1, 2023"
---
Beta body.
```

- [ ] **Step 2: Failing tests**

```ts
// append to tests/markdown.test.ts
import { getProjects } from "../lib/markdown";

const FIXTURE_PROJECTS = path.join(__dirname, "fixtures", "content", "projects");

describe("projects", () => {
  it("exposes factsheet fields and derives year", async () => {
    const projects = await getProjects(FIXTURE_PROJECTS);
    const alpha = projects.find((p) => p.slug === "alpha")!;
    expect(alpha.role).toBe("Solo project");
    expect(alpha.status).toBe("Shipped");
    expect(alpha.platform).toBe("Web");
    expect(alpha.order).toBe(1);
    expect(alpha.year).toBe("2024");
  });

  it("sorts by order and degrades gracefully without optional fields", async () => {
    const projects = await getProjects(FIXTURE_PROJECTS);
    expect(projects.map((p) => p.slug)).toEqual(["alpha", "beta"]);
    const beta = projects[1];
    expect(beta.role).toBeUndefined();
    expect(beta.year).toBe("2023");
  });
});
```

- [ ] **Step 3: Run, expect FAIL** (fields missing)

- [ ] **Step 4: Implement**

Extend the interface:

```ts
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
  order: number;        // defaults to 0 when absent
  year?: string;        // derived from launchDate
  liveUrl?: string;
  sourceUrl?: string;
  image?: string;
  content: string;
  launchDate?: string;
}
```

In both `getProjects` and `getProject`, map the new frontmatter (shared helper to stay DRY):

```ts
function parseProject(slug: string, fileContents: string, htmlContent: string): ProjectPost {
  const { data } = matter(fileContents);
  const launch = data.launchDate ? new Date(data.launchDate) : null;
  return {
    slug,
    title: data.title || "Untitled",
    description: data.description || "",
    purpose: data.purpose || "",
    challenge: data.challenge || "",
    technologies: data.technologies || [],
    category: data.category,
    role: data.role,
    status: data.status,
    platform: data.platform,
    order: typeof data.order === "number" ? data.order : 0,
    year: launch && !Number.isNaN(launch.getTime()) ? String(launch.getFullYear()) : undefined,
    liveUrl: data.liveUrl,
    sourceUrl: data.sourceUrl,
    image: data.image,
    content: htmlContent,
    launchDate: data.launchDate,
  };
}
```

`getProjects` ends with `projects.sort((a, b) => a.order - b.order)` and filters `.md` files.

- [ ] **Step 5: Run tests, expect PASS**

- [ ] **Step 6: Update the four sample project files' frontmatter** — add to each (values per project; chronicle shown):

```yaml
role: "Design, engineering"
status: "Shipped · v1.3"
platform: "Web"
order: 1
```

(mindful `order: 2, role: "Solo project", platform: "iOS & Android"`, palette `order: 3, role: "Design, ML, frontend", platform: "Web"`, syntax `order: 4, role: "Solo project", platform: "Web"`; status values: "Shipped".)

- [ ] **Step 7: Run `pnpm test` (still green), commit**

```bash
git add lib/markdown.ts content/projects tests/
git commit -m "feat: extended project frontmatter (role, status, platform, order, year)"
```

---

### Task 4: Talks collection

**Files:**
- Modify: `lib/markdown.ts`
- Create: `content/talks/.gitkeep` (collection starts empty — no real talks yet)
- Create: `tests/fixtures/content/talks/past-talk.md`, `tests/fixtures/content/talks/future-talk.md`
- Modify: `tests/markdown.test.ts`

- [ ] **Step 1: Fixtures**

```markdown
<!-- tests/fixtures/content/talks/past-talk.md -->
---
title: "A Past Talk"
date: "September 10, 2024"
venue: "Local Meetup"
format: "30 min talk"
links:
  slides: "https://example.com/slides"
  video: "https://example.com/video"
---
```

```markdown
<!-- tests/fixtures/content/talks/future-talk.md -->
---
title: "A Future Talk"
date: "December 1, 2099"
venue: "Conf of the Future"
format: "Keynote"
status: "Confirmed"
---
```

- [ ] **Step 2: Failing tests**

```ts
// append to tests/markdown.test.ts
import { getTalks } from "../lib/markdown";

const FIXTURE_TALKS = path.join(__dirname, "fixtures", "content", "talks");

describe("talks", () => {
  it("partitions upcoming vs past by date", async () => {
    const { upcoming, past } = await getTalks(new Date("2026-06-12"), FIXTURE_TALKS);
    expect(upcoming.map((t) => t.title)).toEqual(["A Future Talk"]);
    expect(past.map((t) => t.title)).toEqual(["A Past Talk"]);
  });

  it("maps links to labeled artifacts", async () => {
    const { past } = await getTalks(new Date("2026-06-12"), FIXTURE_TALKS);
    expect(past[0].links).toEqual([
      { label: "Slides", url: "https://example.com/slides" },
      { label: "Video", url: "https://example.com/video" },
    ]);
  });

  it("returns empty arrays when the directory is empty or missing", async () => {
    const { upcoming, past } = await getTalks(new Date(), path.join(FIXTURE_TALKS, "nope"));
    expect(upcoming).toEqual([]);
    expect(past).toEqual([]);
  });
});
```

- [ ] **Step 3: Run, expect FAIL** (`getTalks` doesn't exist)

- [ ] **Step 4: Implement in `lib/markdown.ts`**

```ts
const TALKS_DIR = path.join(contentDirectory, "talks");

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
      const { data } = matter(fs.readFileSync(path.join(dir, fileName), "utf8"));
      const links = Object.entries((data.links ?? {}) as Record<string, string>).map(
        ([key, url]) => ({
          label: key.charAt(0).toUpperCase() + key.slice(1),
          url,
        }),
      );
      return {
        slug: fileName.replace(/\.md$/, ""),
        title: data.title || "Untitled",
        date: data.date || "",
        venue: data.venue,
        format: data.format,
        status: data.status,
        upcoming: typeof data.upcoming === "boolean" ? data.upcoming : undefined,
        links,
      };
    });

  const isUpcoming = (t: (typeof talks)[number]) =>
    t.upcoming ?? dateValue(new Date(t.date)) >= now.getTime();

  const byDateDesc = (a: Talk, b: Talk) =>
    dateValue(new Date(b.date)) - dateValue(new Date(a.date));
  const byDateAsc = (a: Talk, b: Talk) => -byDateDesc(a, b);

  return {
    upcoming: talks.filter(isUpcoming).map(stripUpcoming).sort(byDateAsc),
    past: talks.filter((t) => !isUpcoming(t)).map(stripUpcoming).sort(byDateDesc),
  };
}

function stripUpcoming({ upcoming: _upcoming, ...talk }: Talk & { upcoming?: boolean }): Talk {
  return talk;
}
```

- [ ] **Step 5: Run tests, expect PASS**

- [ ] **Step 6: Create `content/talks/.gitkeep` and commit**

```bash
git add lib/markdown.ts content/talks tests/
git commit -m "feat: talks collection with upcoming/past partition"
```

---

### Task 5: Static export config + green build

Make `pnpm build` pass: export config, fix `writing/[slug]` imports with a temporary minimal page, stub the three empty page files. Later tasks replace the stubs with the real designs — the point here is an always-green build.

**Files:**
- Modify: `next.config.ts`
- Modify: `app/writing/[slug]/page.tsx`
- Modify: `app/projects/[slug]/page.tsx`, `app/talks/page.tsx`, `app/contact/page.tsx`

- [ ] **Step 1: `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
```

- [ ] **Step 2: Minimal valid `app/writing/[slug]/page.tsx`** (fix imports, add the missing default export; full template comes in Task 9)

```tsx
import { getWritingPost, getWritingPosts } from "@/lib/markdown";
import { notFound } from "next/navigation";

interface WritingPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = await getWritingPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: WritingPostPageProps) {
  const { slug } = await params;
  const post = await getWritingPost(slug);
  if (!post) return { title: "Post Not Found" };
  return { title: post.title, description: post.excerpt };
}

export default async function WritingPostPage({ params }: WritingPostPageProps) {
  const { slug } = await params;
  const post = await getWritingPost(slug);
  if (!post) notFound();

  return (
    <article
      className="prose"
      dangerouslySetInnerHTML={{ __html: post.content }}
    />
  );
}
```

- [ ] **Step 3: Minimal `app/projects/[slug]/page.tsx`**

```tsx
import { getProject, getProjects } from "@/lib/markdown";
import { notFound } from "next/navigation";

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const projects = await getProjects();
  return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) return { title: "Project Not Found" };
  return { title: project.title, description: project.description };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) notFound();

  return (
    <article
      className="prose"
      dangerouslySetInnerHTML={{ __html: project.content }}
    />
  );
}
```

- [ ] **Step 4: Minimal `app/talks/page.tsx` and `app/contact/page.tsx`**

```tsx
// app/talks/page.tsx
export const metadata = { title: "Talks" };

export default function Talks() {
  return <h1 className="font-fraunces text-[68px] font-light">Talks</h1>;
}
```

```tsx
// app/contact/page.tsx
export const metadata = { title: "Contact" };

export default function Contact() {
  return <h1 className="font-fraunces text-[68px] font-light">Contact</h1>;
}
```

- [ ] **Step 5: Build**

Run: `pnpm build`
Expected: success; `out/` contains `index.html`, `writing/`, `projects/`, per-slug directories, `talks/`, `contact/`, `404.html`.

- [ ] **Step 6: Commit**

```bash
git add next.config.ts app/
git commit -m "feat: static export config; all routes build green"
```

---

### Task 6: Site constants

Single source for personal details used by contact, projects footer, talks, RSS.

**Files:**
- Create: `lib/site.ts`

- [ ] **Step 1: Create `lib/site.ts`**

```ts
export const SITE = {
  url: "https://owinz.io",
  name: "Dyllen Owens",
  title: "owinz.io — Dyllen Owens",
  description: "A personal space to share my work, thoughts, and experiences",
  email: "dyllen@owinz.io",
  timezone: "Mountain Time",
  socials: [
    { label: "GitHub", url: "http://github.com/djowinz" },
    { label: "LinkedIn", url: "https://www.linkedin.com/in/dyllen-owens/" },
    { label: "Twitter", url: "https://x.com/djowinz" },
  ],
} as const;
```

- [ ] **Step 2: Commit**

```bash
git add lib/site.ts
git commit -m "feat: central site constants"
```

---

### Task 7: Editorial prose styles

Restyle the existing `.prose` block in `app/globals.css` to the article mockup: 18px body, Fraunces italic headings, panel pull quotes, accent drop cap. Also fix `.prose code`/`.prose pre` using `bg-muted` (a dark gray *text* color) as background.

**Files:**
- Modify: `app/globals.css` (replace the `.prose` rules; keep `.hljs` rules)

- [ ] **Step 1: Replace the `.prose` block**

```css
/* Prose styling for markdown content — editorial article style */
.prose {
    @apply text-foreground;
    font-size: 18px;
    line-height: 1.7;
}

.prose > p:first-of-type::first-letter {
    @apply font-fraunces font-light text-accent float-left;
    font-size: 88px;
    line-height: 0.8;
    margin-right: 12px;
    margin-top: 8px;
}

.prose h1 {
    @apply font-fraunces font-light tracking-[-0.02em] mt-12 mb-4 text-foreground;
    font-size: 40px;
    line-height: 1.05;
}

.prose h2 {
    @apply font-fraunces-italic italic font-normal tracking-[-0.02em] text-foreground;
    font-size: 32px;
    margin: 48px 0 16px;
}

.prose h3 {
    @apply font-fraunces font-normal tracking-[-0.01em] mt-8 mb-3 text-foreground;
    font-size: 22px;
}

.prose p {
    @apply mb-6 text-muted;
}

.prose a {
    @apply text-accent underline underline-offset-4 hover:text-accent/80 transition-colors;
}

.prose strong {
    @apply font-semibold text-foreground;
}

.prose ul {
    @apply mb-6 pl-6 space-y-2 list-disc;
}

.prose ol {
    @apply mb-6 pl-6 space-y-2 list-decimal;
}

.prose li {
    @apply text-muted pl-1;
}

.prose li::marker {
    @apply text-accent/60;
}

.prose blockquote {
    @apply font-fraunces-italic italic font-light text-foreground border-l border-accent;
    background: var(--sidebar);
    font-size: 26px;
    line-height: 1.3;
    letter-spacing: -0.015em;
    margin: 40px 0;
    padding: 28px 32px;
}

.prose blockquote p {
    @apply text-foreground m-0;
    font-size: inherit;
}

.prose code {
    @apply px-1.5 py-0.5 text-sm font-mono text-foreground;
    background: var(--secondary);
}

.prose pre {
    @apply p-5 overflow-x-auto mb-6 border border-edge;
    background: var(--sidebar);
}

.prose pre code {
    @apply bg-transparent p-0;
}

.prose hr {
    @apply my-10 border-edge;
}

.prose img {
    @apply my-8 border border-edge;
}

/* Project case studies: section counters on h2 (§ 01, § 02 …) */
.prose-sections {
    counter-reset: section;
}

.prose-sections h2::before {
    counter-increment: section;
    content: "§ 0" counter(section);
    @apply font-mono not-italic text-accent align-middle;
    font-size: 10px;
    letter-spacing: 0.14em;
    margin-right: 16px;
}
```

- [ ] **Step 2: Build and eyeball one article**

Run: `pnpm build`
Expected: success. Open `out/writing/art-of-debugging/index.html` in a browser — drop cap, italic serif h2s, panel blockquotes.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: editorial prose styles (drop cap, serif headings, panel quotes)"
```

---

### Task 8: Writing index (year-grouped archive + tag filter)

Server page maps posts to lightweight serializable entries; a client component groups by year and filters by category.

**Files:**
- Rewrite: `app/writing/page.tsx`
- Create: `components/WritingArchive.tsx`

- [ ] **Step 1: `components/WritingArchive.tsx`** (client component)

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface ArchiveEntry {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  year: string;
  dateDisplay: string; // "Mar 12"
  readDisplay: string; // "8 min"
}

export default function WritingArchive({ entries }: { entries: ArchiveEntry[] }) {
  const [active, setActive] = useState("All");

  const categories = useMemo(() => {
    const unique = Array.from(new Set(entries.map((e) => e.category).filter(Boolean)));
    return ["All", ...unique];
  }, [entries]);

  const visible = active === "All" ? entries : entries.filter((e) => e.category === active);

  const years = useMemo(() => {
    const grouped = new Map<string, ArchiveEntry[]>();
    for (const entry of visible) {
      const group = grouped.get(entry.year) ?? [];
      group.push(entry);
      grouped.set(entry.year, group);
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [visible]);

  return (
    <>
      {/* Tag filter row */}
      <div className="flex flex-wrap gap-3 mb-14 font-mono text-[11px] tracking-[0.7px]">
        {categories.map((category) => {
          const isActive = category === active;
          return (
            <button
              key={category}
              onClick={() => setActive(category)}
              className={`px-3 py-1.5 border transition-colors cursor-none ${
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-edge text-muted hover:border-foreground"
              }`}
            >
              {category}
            </button>
          );
        })}
      </div>

      {/* Year sections */}
      {years.map(([year, posts]) => (
        <section key={year} className="mb-14">
          <div className="grid grid-cols-[80px_1fr] gap-6 items-baseline border-t border-foreground pt-5 mb-2">
            <h2 className="font-fraunces font-light text-[56px] tracking-[-1.68px] leading-none">
              {year}
            </h2>
            <div className="font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] text-right">
              {posts.length} piece{posts.length === 1 ? "" : "s"}
            </div>
          </div>
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/writing/${post.slug}`}
              className="grid grid-cols-[80px_1fr_90px] gap-6 items-start py-6 border-t border-edge last:border-b cursor-none transition-colors hover:bg-accent/5"
            >
              <div className="font-mono text-muted text-[11px] tracking-[0.7px] pt-1.5">
                {post.dateDisplay}
              </div>
              <div>
                <div className="flex gap-3 items-baseline mb-2">
                  <h3 className="font-fraunces text-2xl tracking-[-0.36px] leading-tight">
                    {post.title}
                  </h3>
                  {post.category && (
                    <span className="font-mono uppercase text-accent text-[9px] tracking-[1.1px] whitespace-nowrap border border-edge px-1.5 py-0.5">
                      {post.category}
                    </span>
                  )}
                </div>
                {post.excerpt && (
                  <p className="text-sm leading-relaxed text-muted max-w-[520px]">
                    {post.excerpt}
                  </p>
                )}
              </div>
              <div className="font-mono text-muted text-[10px] tracking-[0.6px] text-right pt-2">
                {post.readDisplay} →
              </div>
            </Link>
          ))}
        </section>
      ))}
    </>
  );
}
```

- [ ] **Step 2: Rewrite `app/writing/page.tsx`**

```tsx
import { getWritingPosts } from "@/lib/markdown";
import WritingArchive, { ArchiveEntry } from "@/components/WritingArchive";
import { format } from "date-fns";
import { readingTime } from "reading-time-estimator";
import Link from "next/link";

export const metadata = {
  title: "Writing",
  description: "Notes on design, engineering, and the craft of software.",
};

export default async function Writing() {
  const posts = await getWritingPosts();

  const entries: ArchiveEntry[] = posts.map((post) => {
    const date = new Date(post.date);
    const valid = !Number.isNaN(date.getTime());
    return {
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      category: post.category ?? "",
      year: valid ? format(date, "yyyy") : "Undated",
      dateDisplay: valid ? format(date, "MMM dd") : "—",
      readDisplay: `${readingTime(post.content).minutes} min`,
    };
  });

  const years = new Set(entries.map((e) => e.year));

  return (
    <>
      {/* Masthead */}
      <div className="flex justify-between items-baseline font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-7">
        <span>Archive</span>
        <span>
          {entries.length} pieces · {years.size} year{years.size === 1 ? "" : "s"}
        </span>
      </div>

      {/* Hero */}
      <h1 className="font-fraunces font-light text-[96px] tracking-[-3.36px] leading-[0.95] mb-5">
        Writing
      </h1>
      <p className="font-fraunces-italic italic font-light text-[22px] leading-snug text-muted mb-16 max-w-[620px]">
        Notes on design, engineering, and the slow craft of making software
        that doesn&apos;t shout.
      </p>

      <WritingArchive entries={entries} />

      {/* RSS note */}
      <div className="mt-6 px-6 py-5 bg-(--sidebar) border border-edge flex justify-between items-center font-mono text-[11px] tracking-[0.4px] text-muted">
        <span>Reader? There&apos;s an RSS feed.</span>
        <Link href="/feed.xml" className="text-accent cursor-none">
          /feed.xml ↗
        </Link>
      </div>
    </>
  );
}
```

Note: `readingTime` is computed on the raw HTML here because `getWritingPosts` returns rendered content; word count over HTML is approximately right for short prose. If the numbers look off, strip tags first: `post.content.replace(/<[^>]+>/g, " ")`. Use the stripped version from the start.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: success; `out/writing/index.html` contains year headings and post rows.

- [ ] **Step 4: Manual check** — `pnpm dev`, visit `/writing`: tag filter narrows the list, "All" restores it.

- [ ] **Step 5: Commit**

```bash
git add app/writing/page.tsx components/WritingArchive.tsx
git commit -m "feat: writing archive with year groups and tag filter"
```

---

### Task 9: Article template

Full editorial article page replacing the Task 5 minimal version.

**Files:**
- Rewrite: `app/writing/[slug]/page.tsx`

- [ ] **Step 1: Rewrite the page**

```tsx
import { getWritingPost, getWritingPosts } from "@/lib/markdown";
import { format } from "date-fns";
import { readingTime } from "reading-time-estimator";
import Link from "next/link";
import { notFound } from "next/navigation";

interface WritingPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = await getWritingPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: WritingPostPageProps) {
  const { slug } = await params;
  const post = await getWritingPost(slug);
  if (!post) return { title: "Post Not Found" };
  return { title: post.title, description: post.excerpt };
}

function formatDate(raw: string, pattern: string): string | null {
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : format(date, pattern);
}

export default async function WritingPostPage({ params }: WritingPostPageProps) {
  const { slug } = await params;
  const post = await getWritingPost(slug);
  if (!post) notFound();

  const dateDisplay = formatDate(post.date, "d MMMM yyyy");
  const read = readingTime(post.content.replace(/<[^>]+>/g, " "));
  const readNext = (await getWritingPosts()).filter((p) => p.slug !== slug).slice(0, 2);

  const metaParts = [post.category, dateDisplay, `${read.minutes} min read`].filter(
    Boolean,
  ) as string[];

  return (
    <div className="max-w-[680px] mx-auto">
      {/* Back link */}
      <Link
        href="/writing"
        className="inline-flex gap-2 items-center font-mono uppercase text-muted text-[11px] tracking-[1.3px] mb-12 cursor-none transition-colors hover:text-accent"
      >
        <span>←</span>
        <span>All writing</span>
      </Link>

      {/* Meta row */}
      <div className="flex gap-5 font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-6">
        {metaParts.map((part, i) => (
          <span key={part} className="flex gap-5">
            {i > 0 && <span>/</span>}
            <span>{part}</span>
          </span>
        ))}
      </div>

      {/* Title + dek */}
      <h1 className="font-fraunces font-light text-[64px] tracking-[-1.92px] leading-[1.02] mb-5">
        {post.title}
      </h1>
      {post.excerpt && (
        <p className="font-fraunces-italic italic font-light text-[22px] leading-snug text-muted mb-12">
          {post.excerpt}
        </p>
      )}

      {/* Byline strip */}
      <div className="flex justify-between items-center pb-6 mb-10 border-b border-edge">
        <div>
          <div className="text-[13px]">Dyllen Owens</div>
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

      {/* Body */}
      <article className="prose" dangerouslySetInnerHTML={{ __html: post.content }} />

      {/* Footer meta */}
      <div className="mt-16 pt-6 border-t border-edge flex justify-between items-center font-mono text-[11px] tracking-[0.7px] text-muted">
        <span>{post.category ? `Filed under: ${post.category}` : " "}</span>
        <span>/ END /</span>
      </div>

      {/* Read next */}
      {readNext.length > 0 && (
        <section className="mt-18">
          <h2 className="font-fraunces-italic italic font-medium text-[22px] tracking-[-0.22px] mb-5 pb-3.5 border-b border-edge">
            Read next
          </h2>
          {readNext.map((next) => {
            const nextDate = formatDate(next.date, "MMM dd, yyyy");
            const nextRead = readingTime(next.content.replace(/<[^>]+>/g, " "));
            return (
              <Link
                key={next.slug}
                href={`/writing/${next.slug}`}
                className="grid grid-cols-[100px_1fr_80px] gap-6 py-5 border-b border-edge cursor-none transition-colors hover:bg-accent/5"
              >
                <div className="font-mono text-muted text-[11px] tracking-[0.7px]">
                  {nextDate ?? "—"}
                </div>
                <div className="font-fraunces text-xl tracking-[-0.2px] leading-tight">
                  {next.title}
                </div>
                <div className="font-mono text-muted text-[10px] tracking-[0.6px] text-right">
                  {nextRead.minutes} min →
                </div>
              </Link>
            );
          })}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build + manual check**

Run: `pnpm build`
Expected: success. `out/writing/art-of-debugging/index.html` shows the full template; the minimal-frontmatter behavior (no category/date) renders without "undefined" anywhere.

- [ ] **Step 3: Commit**

```bash
git add "app/writing/[slug]/page.tsx"
git commit -m "feat: editorial article template with read-next"
```

---

### Task 10: Projects index

**Files:**
- Rewrite: `app/projects/page.tsx`

- [ ] **Step 1: Rewrite the page**

```tsx
import { getProjects, getTalks } from "@/lib/markdown";
import { SITE } from "@/lib/site";
import Link from "next/link";

export const metadata = {
  title: "Projects",
  description: "Selected software projects, built carefully.",
};

export default async function Projects() {
  const projects = await getProjects();
  const { past: pastTalks } = await getTalks();

  return (
    <div className="max-w-[760px] mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2.5 font-mono font-medium uppercase text-muted text-[11px] tracking-[1.3px] mb-12">
        <span>Index</span>
        <span className="opacity-40">/</span>
        <span className="text-foreground">Projects</span>
      </div>

      {/* Hero */}
      <header className="mb-16 max-w-[640px]">
        <h1 className="font-fraunces font-light text-[68px] tracking-[-2.38px] leading-[0.98] mb-6">
          Things I&apos;ve <em className="font-normal font-fraunces-italic">built</em>,
          carefully.
        </h1>
        <p className="text-[17px] leading-relaxed text-muted max-w-[520px]">
          A small collection of projects. Each solves a problem I had. Each
          taught me something I didn&apos;t expect.
        </p>
      </header>

      {/* Project list */}
      <section className="mb-20">
        {projects.map((project, i) => (
          <Link
            key={project.slug}
            href={`/projects/${project.slug}`}
            className="group grid grid-cols-[48px_1fr_80px_20px] gap-6 py-7 items-start border-t border-edge last:border-b cursor-none transition-colors hover:bg-accent/[0.025]"
          >
            <div className="font-mono text-muted text-[11px] tracking-[0.9px] pt-1.5">
              {String(i + 1).padStart(2, "0")}
            </div>
            <div>
              <div className="flex items-baseline gap-3.5 mb-1.5">
                <h3 className="font-fraunces text-[30px] tracking-[-0.6px] leading-none group-hover:italic">
                  {project.title}
                </h3>
                {project.category && (
                  <span className="font-mono uppercase text-muted text-[10px] tracking-[1px]">
                    — {project.category}
                  </span>
                )}
              </div>
              {project.description && (
                <p className="text-sm leading-relaxed text-muted mb-3 max-w-[520px]">
                  {project.description}
                </p>
              )}
              <div className="flex flex-wrap gap-3.5">
                {project.technologies.map((tech) => (
                  <span
                    key={tech}
                    className="font-mono uppercase text-muted text-[10px] tracking-[0.6px]"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
            <div className="font-mono text-muted text-[11px] tracking-[0.4px] pt-1.5 text-right">
              {project.year}
            </div>
            <div className="pt-2.5 text-lg text-accent font-fraunces opacity-25 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0">
              →
            </div>
          </Link>
        ))}
      </section>

      {/* Recent talks (hidden while empty) */}
      {pastTalks.length > 0 && (
        <section className="mb-16">
          <div className="flex items-baseline gap-5 mb-7">
            <span className="font-mono uppercase text-accent text-[11px] tracking-[1.3px]">
              — Also
            </span>
            <h2 className="font-fraunces-italic italic font-normal text-2xl tracking-[-0.24px]">
              Recent talks
            </h2>
          </div>
          <div className="border-t border-edge">
            {pastTalks.slice(0, 3).map((talk) => (
              <div
                key={talk.slug}
                className="grid grid-cols-[120px_1fr_auto] gap-6 py-4.5 border-b border-edge text-sm text-muted"
              >
                <span className="font-mono text-[11px]">{talk.date}</span>
                <span className="text-foreground">{talk.title}</span>
                <span className="italic">{talk.venue}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Contact footer */}
      <section className="border-t border-edge pt-10 grid grid-cols-[1fr_auto] gap-8 items-end">
        <div>
          <p className="font-fraunces-italic italic font-light text-[28px] tracking-[-0.42px] leading-tight mb-3 max-w-[420px]">
            Have something you&apos;d like to build together?
          </p>
          <a
            href={`mailto:${SITE.email}`}
            className="text-sm text-accent underline underline-offset-4 cursor-none"
          >
            {SITE.email}
          </a>
        </div>
        <div className="flex gap-5 font-mono uppercase text-muted text-[11px] tracking-[0.9px]">
          {SITE.socials.map((social) => (
            <a
              key={social.label}
              href={social.url}
              className="cursor-none transition-colors hover:text-accent"
            >
              {social.label} ↗
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Build, manual check, commit**

Run: `pnpm build`
Expected: success; `/projects` lists 4 numbered projects; no talks strip (collection empty); contact footer shows real email + 3 socials.

```bash
git add app/projects/page.tsx
git commit -m "feat: projects index with numbered editorial list"
```

---

### Task 11: Project detail (case study)

**Files:**
- Rewrite: `app/projects/[slug]/page.tsx`

- [ ] **Step 1: Rewrite the page**

```tsx
import { getProject, getProjects } from "@/lib/markdown";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const projects = await getProjects();
  return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) return { title: "Project Not Found" };
  return { title: project.title, description: project.description };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const projects = await getProjects();
  const index = projects.findIndex((p) => p.slug === slug);
  if (index === -1) notFound();
  const project = projects[index];
  const num = String(index + 1).padStart(2, "0");
  const next = projects[(index + 1) % projects.length];

  const facts = [
    ["Role", project.role],
    ["Year", project.year],
    ["Status", project.status],
    ["Platform", project.platform],
  ].filter(([, value]) => Boolean(value)) as [string, string][];

  const metaParts = [`№ ${num}`, project.year, project.category].filter(
    Boolean,
  ) as string[];

  return (
    <div className="max-w-[720px] mx-auto">
      {/* Back link */}
      <Link
        href="/projects"
        className="inline-flex gap-2 items-center font-mono uppercase text-muted text-[11px] tracking-[1.3px] mb-14 cursor-none transition-colors hover:text-accent"
      >
        <span>←</span>
        <span>Back to projects</span>
      </Link>

      {/* Meta row */}
      <div className="flex gap-6 font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-7">
        {metaParts.map((part, i) => (
          <span key={part} className="flex gap-6">
            {i > 0 && <span>/</span>}
            <span>{part}</span>
          </span>
        ))}
      </div>

      {/* Title + dek */}
      <h1 className="font-fraunces font-light text-[88px] tracking-[-3.08px] leading-[0.95] mb-6">
        {project.title}
      </h1>
      {project.description && (
        <p className="font-fraunces-italic italic font-light text-2xl tracking-[-0.24px] leading-snug text-muted mb-14 max-w-[580px]">
          {project.description}
        </p>
      )}

      {/* Figure panel */}
      <div className="relative aspect-[16/10] border border-edge mb-12 overflow-hidden bg-gradient-to-br from-(--secondary) to-(--sidebar)">
        {project.image ? (
          <Image
            src={project.image}
            alt={`${project.title} screenshot`}
            fill
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-10 flex items-center justify-center font-mono uppercase text-muted text-[10px] tracking-[1.4px]">
            {project.title}
          </div>
        )}
        <div className="absolute top-4 right-5 font-mono text-muted text-[10px] tracking-[1px]">
          FIG. 01 — OVERVIEW
        </div>
      </div>

      {/* Buttons */}
      {(project.liveUrl || project.sourceUrl) && (
        <div className="flex gap-3 mb-16">
          {project.liveUrl && (
            <a
              href={project.liveUrl}
              className="inline-flex items-center gap-2.5 py-3 px-4.5 bg-foreground text-background text-[13px] cursor-none transition-all ring-0 hover:ring-4 ring-accent ring-inset"
            >
              View live <span className="opacity-60">↗</span>
            </a>
          )}
          {project.sourceUrl && (
            <a
              href={project.sourceUrl}
              className="inline-flex items-center gap-2.5 py-3 px-4.5 border border-edge text-[13px] cursor-none transition-colors hover:border-foreground"
            >
              Source <span className="opacity-60">↗</span>
            </a>
          )}
        </div>
      )}

      {/* Factsheet */}
      <div className="grid grid-cols-2 gap-x-12 gap-y-8 border-y border-edge py-8 mb-16">
        {facts.map(([key, value]) => (
          <div key={key}>
            <div className="font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-2">
              {key}
            </div>
            <div className="text-[15px]">{value}</div>
          </div>
        ))}
        {project.technologies.length > 0 && (
          <div className="col-span-full">
            <div className="font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-2.5">
              Stack
            </div>
            <div className="flex flex-wrap gap-4.5">
              {project.technologies.map((tech) => (
                <span key={tech} className="font-mono text-[11px] tracking-[0.4px]">
                  {tech}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Body — § counters via .prose-sections */}
      <article
        className="prose prose-sections"
        dangerouslySetInnerHTML={{ __html: project.content }}
      />

      {/* Next project footer */}
      {next.slug !== project.slug && (
        <section className="mt-16 border-t border-edge pt-8 flex justify-between items-end">
          <div>
            <div className="font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-2.5">
              Next project →
            </div>
            <Link
              href={`/projects/${next.slug}`}
              className="font-fraunces text-[40px] tracking-[-0.8px] cursor-none transition-colors hover:text-accent"
            >
              {next.title}{" "}
              <span className="font-mono text-xs text-muted align-super ml-1.5">
                № {String(((index + 1) % projects.length) + 1).padStart(2, "0")}
              </span>
            </Link>
          </div>
          <Link
            href="/projects"
            className="font-mono uppercase text-muted text-[11px] tracking-[1.1px] border-b border-edge pb-1 cursor-none transition-colors hover:text-accent"
          >
            All projects
          </Link>
        </section>
      )}
    </div>
  );
}
```

Note: the project-detail drop cap is wrong for case studies — suppress it by scoping: in `globals.css` change the drop-cap selector to `.prose:not(.prose-sections) > p:first-of-type::first-letter` if it looks off on project pages. Make that change as part of this task.

- [ ] **Step 2: Build, manual check, commit**

Run: `pnpm build`
Expected: success; chronicle page shows meta row, factsheet (Role/Year/Status/Platform/Stack), § numbered h2s, next-project footer cycling chronicle→mindful.

```bash
git add "app/projects/[slug]/page.tsx" app/globals.css
git commit -m "feat: project case-study template with factsheet and section counters"
```

---

### Task 12: Talks page

**Files:**
- Rewrite: `app/talks/page.tsx`

- [ ] **Step 1: Rewrite the page**

```tsx
import { getTalks } from "@/lib/markdown";
import { SITE } from "@/lib/site";

export const metadata = {
  title: "Talks",
  description: "Speaking about small software and the craft of shipping quietly.",
};

const TOPICS = [
  "The craft of small software",
  "Honest data visualisation",
  "Designing for calm, not engagement",
  "Being a one-person design/eng team",
];

export default async function Talks() {
  const { upcoming, past } = await getTalks();

  return (
    <div className="max-w-[880px] mx-auto">
      {/* Masthead */}
      <div className="flex justify-between items-baseline font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-7">
        <span>Speaking</span>
        <span>
          {upcoming.length} upcoming · {past.length} past
        </span>
      </div>

      {/* Hero */}
      <h1 className="font-fraunces font-light text-[96px] tracking-[-3.36px] leading-[0.95] mb-5">
        Talks
      </h1>
      <p className="font-fraunces-italic italic font-light text-[22px] leading-snug text-muted mb-18 max-w-[640px]">
        I speak about small software, visualisation, and the craft of
        shipping things quietly.
      </p>

      {/* Upcoming */}
      <section className="mb-20">
        <div className="flex gap-3 items-center mb-7">
          <span className="w-2 h-2 rounded-full bg-accent shadow-[0px_0px_0px_4px_rgba(124,58,237,0.15)]" />
          <h2 className="font-fraunces-italic italic font-normal text-[28px] tracking-[-0.42px]">
            Upcoming
          </h2>
        </div>

        {upcoming.length > 0 ? (
          <div className="grid gap-4">
            {upcoming.map((talk) => (
              <article
                key={talk.slug}
                className="grid grid-cols-[200px_1fr_auto] gap-8 px-8 py-7 bg-(--sidebar) border border-edge items-start"
              >
                <div>
                  <div className="font-mono uppercase text-accent text-[11px] tracking-[0.9px] mb-2.5">
                    {talk.date}
                  </div>
                  {talk.format && (
                    <div className="font-mono uppercase text-muted text-[10px] tracking-[1.2px]">
                      {talk.format}
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="font-fraunces text-[30px] tracking-[-0.6px] leading-tight mb-2.5">
                    {talk.title}
                  </h3>
                  {talk.venue && (
                    <div className="text-sm text-muted leading-normal">{talk.venue}</div>
                  )}
                </div>
                {talk.status && (
                  <div className="font-mono uppercase text-muted text-[10px] tracking-[1.2px] border border-edge px-2.5 py-1 bg-background">
                    {talk.status}
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <article className="grid grid-cols-[200px_1fr_auto] gap-8 px-8 py-7 bg-(--sidebar) border border-edge items-start">
            <div className="font-mono uppercase text-accent text-[11px] tracking-[0.9px]">
              2026 season
            </div>
            <div>
              <h3 className="font-fraunces text-[30px] tracking-[-0.6px] leading-tight mb-2.5">
                Currently scheduling
              </h3>
              <div className="text-sm text-muted leading-normal">
                The next round of talks is being planned. Have a stage in mind?{" "}
                <a
                  href={`mailto:${SITE.email}`}
                  className="text-accent underline underline-offset-4 cursor-none"
                >
                  Invite me to speak
                </a>
                .
              </div>
            </div>
            <div className="font-mono uppercase text-muted text-[10px] tracking-[1.2px] border border-edge px-2.5 py-1 bg-background">
              Open
            </div>
          </article>
        )}
      </section>

      {/* Past (hidden while empty) */}
      {past.length > 0 && (
        <section className="mb-20">
          <h2 className="font-fraunces-italic italic font-normal text-[28px] tracking-[-0.42px] mb-2 pb-5 border-b border-foreground">
            Past
          </h2>
          {past.map((talk) => (
            <article
              key={talk.slug}
              className="grid grid-cols-[120px_1fr_200px] gap-6 py-6 border-b border-edge items-baseline"
            >
              <div className="font-mono text-muted text-[11px] tracking-[0.7px]">
                {talk.date}
              </div>
              <div>
                <h3 className="font-fraunces text-[22px] tracking-[-0.33px] leading-tight mb-1.5">
                  {talk.title}
                </h3>
                {talk.venue && <div className="text-[13px] text-muted">{talk.venue}</div>}
              </div>
              <div className="flex gap-2.5 justify-end">
                {talk.links.map((link) => (
                  <a
                    key={link.label}
                    href={link.url}
                    className="font-mono uppercase text-[10px] tracking-[1px] border border-edge px-2.5 py-1.5 cursor-none transition-colors hover:border-foreground"
                  >
                    {link.label} ↗
                  </a>
                ))}
              </div>
            </article>
          ))}
        </section>
      )}

      {/* What I speak about + booking */}
      <section className="grid grid-cols-2 gap-12 pt-10 border-t border-edge">
        <div>
          <div className="font-mono font-medium uppercase text-accent text-[10px] tracking-[1.4px] mb-3.5">
            — What I speak about
          </div>
          <ul className="font-fraunces-italic italic font-light text-xl leading-loose">
            {TOPICS.map((topic) => (
              <li key={topic}>— {topic}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="font-mono font-medium uppercase text-accent text-[10px] tracking-[1.4px] mb-3.5">
            — Booking
          </div>
          <p className="text-[15px] leading-relaxed text-muted mb-4">
            I prefer small conferences, meetups, and internal company events
            where there&apos;s room for conversation afterwards.
          </p>
          <a
            href={`mailto:${SITE.email}?subject=Speaking invitation`}
            className="font-mono uppercase text-[11px] tracking-[1.1px] border-b border-accent pb-1 cursor-none transition-colors hover:text-accent"
          >
            Invite me to speak →
          </a>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Build, manual check, commit**

Run: `pnpm build`
Expected: success; `/talks` shows masthead "0 upcoming · 0 past", the "Currently scheduling" card, no Past section, topics + booking footer.

```bash
git add app/talks/page.tsx
git commit -m "feat: talks page with currently-scheduling empty state"
```

---

### Task 13: Contact page

**Files:**
- Rewrite: `app/contact/page.tsx`

- [ ] **Step 1: Rewrite the page**

```tsx
import { SITE } from "@/lib/site";
import Link from "next/link";

export const metadata = {
  title: "Contact",
  description: "How to reach Dyllen Owens.",
};

const CHANNELS: [string, string, string, string][] = [
  ["Email", SITE.email, `mailto:${SITE.email}`, "Best for anything substantive"],
  ["GitHub", "github.com/djowinz", SITE.socials[0].url, "Code, issues, small PRs"],
  ["LinkedIn", "in/dyllen-owens", SITE.socials[1].url, "The professional bits"],
  ["Twitter", "@djowinz", SITE.socials[2].url, "Short thoughts, replies welcome"],
];

const REPLIES = [
  "Notes on the writing",
  "Questions about the tools I make",
  "Freelance inquiries (selective)",
  "Speaking invitations",
  "Genuinely interesting cold emails",
];

const NO_REPLIES = [
  "Mass outreach templates",
  '"Quick call" requests with no context',
  "Crypto anything, sorry",
];

export default function Contact() {
  return (
    <div className="max-w-[820px] mx-auto">
      {/* Masthead */}
      <div className="flex justify-between items-baseline font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-7">
        <span>Correspondence</span>
        <span>{SITE.timezone}</span>
      </div>

      <h1 className="font-fraunces font-light text-[96px] tracking-[-3.36px] leading-[0.95] mb-16">
        Say <em className="font-fraunces-italic text-accent">hello</em>.
      </h1>

      {/* Letter */}
      <div className="font-fraunces font-light text-2xl tracking-[-0.12px] leading-normal mb-18 max-w-[720px]">
        <p className="mb-6">
          The best way to reach me is{" "}
          <a
            href={`mailto:${SITE.email}`}
            className="text-accent italic underline underline-offset-4 cursor-none"
          >
            {SITE.email}
          </a>
          . I read every message and try to reply within a few days, though
          I&apos;ve been known to take a week when the inbox gets unkind.
        </p>
        <p className="mb-6 text-muted">
          I&apos;m especially glad to hear from you if you&apos;re working on{" "}
          <em>small, considered</em> software — or if you&apos;ve read
          something I wrote and want to disagree with me. I like being
          disagreed with.
        </p>
        <p className="text-muted">
          For speaking invitations,{" "}
          <a
            href={`mailto:${SITE.email}?subject=Speaking invitation`}
            className="text-accent italic underline underline-offset-4 cursor-none"
          >
            email works too
          </a>
          . Write in your own words. I prefer it.
        </p>
      </div>

      {/* Channels + reply lists */}
      <div className="grid grid-cols-[1.1fr_1fr] gap-16 border-t border-edge pt-10">
        <section>
          <div className="font-mono font-medium uppercase text-accent text-[10px] tracking-[1.4px] mb-5">
            — Channels
          </div>
          {CHANNELS.map(([label, display, url, note]) => (
            <div
              key={label}
              className="grid grid-cols-[100px_1fr] gap-5 py-4.5 border-b border-edge items-baseline"
            >
              <div className="font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px]">
                {label}
              </div>
              <div>
                <a
                  href={url}
                  className="block font-fraunces text-xl tracking-[-0.2px] cursor-none transition-colors hover:text-accent"
                >
                  {display}
                </a>
                <div className="text-xs text-muted italic mt-1">{note}</div>
              </div>
            </div>
          ))}
        </section>

        <section>
          <div className="font-mono font-medium uppercase text-accent text-[10px] tracking-[1.4px] mb-5">
            — What I reply to
          </div>
          <ul className="font-fraunces-italic italic font-light text-lg leading-normal mb-7">
            {REPLIES.map((item) => (
              <li key={item} className="flex gap-3 py-2">
                <span className="text-accent not-italic">+</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-3.5">
            — Probably won&apos;t reply to
          </div>
          <ul className="text-sm leading-relaxed text-muted">
            {NO_REPLIES.map((item) => (
              <li key={item} className="flex gap-3 py-1">
                <span className="text-(--edge)">—</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Sign-off */}
      <div className="mt-20 pt-8 border-t border-edge flex justify-between items-baseline">
        <div>
          <div className="font-fraunces-italic italic font-light text-[28px] tracking-[-0.28px] mb-1">
            — Dyllen
          </div>
          <div className="font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px]">
            Written from the Mountain Time zone
          </div>
        </div>
        <Link
          href="/feed.xml"
          className="font-mono font-medium uppercase text-accent text-[10px] tracking-[1.4px] cursor-none"
        >
          RSS ↗
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build, manual check, commit**

Run: `pnpm build`
Expected: success; `/contact` shows the letter with `dyllen@owinz.io`, four channels, reply lists, sign-off.

```bash
git add app/contact/page.tsx
git commit -m "feat: contact page with real channels"
```

---

### Task 14: RSS feed

**Files:**
- Create: `app/feed.xml/route.ts`

- [ ] **Step 1: Create the route handler**

```ts
import { getWritingPosts } from "@/lib/markdown";
import { SITE } from "@/lib/site";

export const dynamic = "force-static";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const posts = await getWritingPosts();

  const items = posts
    .map((post) => {
      const date = new Date(post.date);
      const pubDate = Number.isNaN(date.getTime()) ? "" : date.toUTCString();
      const url = `${SITE.url}/writing/${post.slug}/`;
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${url}</link>
      <guid>${url}</guid>
      ${pubDate ? `<pubDate>${pubDate}</pubDate>` : ""}
      <description>${escapeXml(post.excerpt)}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(SITE.title)}</title>
    <link>${SITE.url}</link>
    <description>${escapeXml(SITE.description)}</description>
    <language>en</language>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
```

- [ ] **Step 2: Build and verify the file exports**

Run: `pnpm build`
Expected: success; `out/feed.xml` exists and starts with `<?xml`.

- [ ] **Step 3: Commit**

```bash
git add app/feed.xml
git commit -m "feat: static RSS feed from writing posts"
```

---

### Task 15: Polish + final verification

**Files:**
- Modify: `app/layout.tsx` (metadata title template)
- Modify: `components/Sidebar.tsx` (footer line, drop unused ThemeToggle import)

- [ ] **Step 1: Metadata title template in `app/layout.tsx`**

```tsx
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: {
    default: SITE.title,
    template: "%s — owinz.io",
  },
  description: SITE.description,
};
```

- [ ] **Step 2: Sidebar footer** — replace the commented-out footer block in `components/Sidebar.tsx` with (and remove the now-unused `ThemeToggle` import):

```tsx
{/* Footer */}
<div className="w-full flex items-center justify-between font-mono text-[11px] tracking-[0.2px] text-muted-foreground">
  <span>MMXXVI</span>
  <span>◐</span>
</div>
```

- [ ] **Step 3: Full verification**

Run: `pnpm test` → all green.
Run: `pnpm lint` → clean.
Run: `pnpm build` → success.

Manual matrix with `pnpm dev`:
- `/` — recent content shows **newest** items first
- `/writing` — year groups, filter works, RSS note
- `/writing/art-of-debugging` — full article template, prose styles
- `/projects` — 4 numbered rows, contact footer
- `/projects/chronicle` — factsheet, § sections, next-project footer
- `/talks` — "Currently scheduling" card
- `/contact` — real details
- `/feed.xml` — valid XML
- A nonsense URL `/writing/nope` → 404

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx components/Sidebar.tsx
git commit -m "feat: metadata title template and sidebar footer"
```
