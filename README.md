# owinz.io

Personal site of Dyllen Owens: Next.js 16 (App Router), Tailwind v4, exported as a fully static site (`out/`) and hosted on Vercel.

```bash
pnpm dev            # http://localhost:3000
pnpm build          # content check → next build → SEO audit (fails on errors)
pnpm test           # vitest
pnpm content:check  # just the frontmatter validator
pnpm seo:audit      # just the post-build audit of out/
```

## CMS (in progress)

Content is moving from the Markdown files in `content/` into a database, so it can be published without a redeploy. Until the import has run, `content/` is still the source to edit.

- **Storage.** Posts, projects, and talks live in Neon Postgres (`lib/db/schema.ts`), with Markdown bodies stored as Markdown. Photos live in Vercel Blob, processed on upload, and are served from `owinz.io/writing/<slug>/<photo>`.
- **Drafts and live versions.** Editing changes a post's working draft. Publishing snapshots the draft into a version, and the site renders that snapshot, so the live page never changes until someone publishes. Each post or project keeps its last 10 published versions and 50 autosaves (an autosave is stored only when something changed).
- **Roles** (`lib/cms/permissions.ts`): editors can do everything, including deleting content and managing users. Writers create, edit, publish, unpublish, and restore. Contributors create content and edit their own until it's first published.
- **Bylines.** A post's byline is the author readers see (default: Dyllen Owens), independent of the CMS account that wrote or published it.
- **Caching.** Pages are prerendered and cached under per-collection tags (`lib/content`). Publishing refreshes the tag, so only affected pages re-render; everything stays full HTML for search engines and AI crawlers.

### Local setup

Everything runs offline: Postgres in Docker, and photos in `.data/blob/` instead of Vercel Blob.

```bash
cp .env.example .env.local     # local defaults
pnpm db:up                     # start Postgres (docker compose, port 54322)
pnpm db:migrate                # create the tables
pnpm content:import            # load content/ into the database (photos → .data/blob/)
pnpm dev                       # http://localhost:3000
```

```bash
pnpm build                     # migrate → next build → SEO audit against next start
pnpm db:reset                  # wipe the local database and re-run migrations
pnpm db:down                   # stop Postgres (data is kept in a Docker volume)
pnpm db:generate               # after changing lib/db/schema.ts, write a migration
pnpm content:import --dry-run  # list what would be imported
```

Local URLs (`localhost`) use a normal Postgres connection; Neon URLs use Neon's HTTP driver. To work against real services instead, point `.env.local` at a Neon branch and set `OWINZ_IO_BLOB_DRIVER=vercel` plus the Blob token (see `.env.example`). Vercel won't download Sensitive variables, so `vercel env pull` only writes placeholders for these.

Tests run against an in-process Postgres (PGlite) and need neither Docker nor Neon.

## Publishing content

Add a Markdown file; everything else is generated at build time. The file name is the URL slug, so use `lowercase-words-with-hyphens.md`.

| Collection | Folder              | URL                 |
| ---------- | ------------------- | ------------------- |
| Writing    | `content/writing/`  | `/writing/<slug>/`  |
| Projects   | `content/projects/` | `/projects/<slug>/` |
| Talks      | `content/talks/`    | listed on `/talks/` |

Dates can be written as `"March 15, 2026"` or `2026-03-15`; both mean that calendar day.

### Writing

```yaml
---
title: "The Art of Debugging"        # required · keep under ~70 chars
date: "March 15, 2026"               # required
excerpt: "One or two sentences…"     # recommended · 70–170 chars; becomes the meta description
category: "Engineering"              # recommended · archive filter + article:section
tags: [debugging, process]           # optional · keywords, article:tag, RSS categories
updated: "April 2, 2026"             # optional · dateModified + sitemap lastmod after a revision
---
```

Start body sections at `##`; the title is already the page's `<h1>`.

#### Photos

A post with photos is a folder instead of a single file. The photos sit beside the text:

```
content/writing/my-post/
  index.md          ← the post (same frontmatter as above)
  harbor.jpg
  dashboard.png
```

Reference a photo by its file name. Text in quotes after the file name becomes the caption:

```md
![Fishing boats in the harbor at dawn](harbor.jpg "Portland harbor, 6am.")

![The dashboard after the redesign](dashboard.png)
```

- **Alt text** (in the brackets) describes the image for screen readers and search. Write it for every image.
- **Captions** are optional. An image on its own line becomes a figure, with the caption underneath.
- **Placement:** images are centered by default. Add `#left` or `#right` to the file name and the text wraps around the image, newspaper-style. Put the image line before the paragraphs that should wrap around it:

  ```md
  ![Whiteboard from the incident review](whiteboard.jpg#right "The sketch that cracked it.")

  The paragraph that wraps to the left of the photo…
  ```

  Floated images take 45% of the column. On phones they stack full-width, since the column is too narrow to wrap. Headings and centered images always start below a floated one.
- **Formats:** JPEG, PNG, WebP, AVIF, GIF, and SVG. iPhone HEIC photos need exporting as JPEG first (or set Settings → Camera → Formats → Most Compatible).
- **Any size is fine.** At build time, photos are rotated upright, scaled to at most 1600px wide, recompressed (PNGs stay lossless), and stripped of metadata, including the GPS location phones embed. The originals in `content/` aren't modified. GIFs and SVGs ship as-is.
- Only photos the post references are published, at `/writing/my-post/harbor.jpg`. `og.png` is reserved for the generated social card.
- To convert an existing post, move `my-post.md` to `my-post/index.md`. The URL doesn't change.

`pnpm content:check` reports a missing file, a typo'd name, a HEIC photo, missing alt text, or a photo in the folder that the post never uses.

`content/writing/art-of-debugging/` is a worked example with sample images.

### Projects

```yaml
---
title: "Chronicle"                   # required
description: "One or two sentences…" # recommended · 70–170 chars
launchDate: "March 15, 2026"         # recommended · drives the year shown
category: "Personal Finance"
technologies: [React, D3.js]
role: "Design, engineering"
status: "Shipped · v1.3"
platform: "Web"
order: 1                             # position on /projects
liveUrl: "https://…"
sourceUrl: "https://github.com/…"
image: "/projects/chronicle.png"     # optional figure (put the file in public/)
updated: "…"                         # optional
---
```

### Talks

```yaml
---
title: "On small software"           # required
date: "September 10, 2026"           # required · future dates list as upcoming
venue: "Local Meetup"
format: "30 min talk"
status: "Confirmed"
links:
  slides: "https://…"
  video: "https://…"
---
```

## What the build generates

Nothing below needs hand-editing when content changes.

- **Per-page metadata** (`lib/seo.ts`): title, description (the excerpt, or else the first paragraph), canonical URL, Open Graph and Twitter cards, article dates, tags.
- **Social cards** (`lib/og.tsx`): a 1200×630 PNG for every article (`/writing/<slug>/og.png`), every project, and each section.
- **Structured data** (`lib/schema.ts`): JSON-LD for `WebSite` and `Person` on every page, plus `BlogPosting`, `Blog`, `CreativeWork`, `Event`, `BreadcrumbList`, `ProfilePage`, and `ContactPage` where they apply.
- **Crawler files**: `sitemap.xml`, `robots.txt`, `feed.xml` (full-text RSS), `manifest.webmanifest`.
- **GEO**: [`llms.txt`](https://llmstxt.org), a map of the site for language models, and `llms-full.txt`, every article and case study as Markdown.
- **Icons**: `favicon.ico` is packed from `public/png-logo/do-monogram-{16,32,48}.png`. The 180 (apple-touch), 192, and 512 (manifest, also used as maskable) PNGs are served as-is. To change the logo, replace those files at the same sizes, keeping an opaque background with the mark inside the center 80%.

The cards and `favicon.ico` are rendered by route handlers in folders named `og.png` and `favicon.ico` (article cards and photos share `app/writing/[slug]/[file]`), rather than by `opengraph-image.tsx`. Static export writes convention-based images without file extensions, and static hosts pick the `Content-Type` from the extension, so they would be served as `application/octet-stream`. Fonts for the images live in `assets/fonts/` (OFL) so builds don't need the network.

## Build guardrails

- `scripts/validate-content.mjs` checks the Markdown in `content/` (missing titles or dates, bad URLs and slugs, missing photos, alt text). It runs before `pnpm content:import`; in the CMS milestones the same checks move into saving.
- `scripts/seo-audit.mjs` crawls the running site after `next build` (or any deployment: `pnpm seo:audit https://…`). It starts at the sitemap and follows every internal link. It fails on a missing or duplicate title, a missing description or canonical, a canonical that doesn't match the page URL, missing Open Graph tags, an og:image or photo that doesn't load as an image, any count of `<h1>` other than one, invalid JSON-LD, images without `alt`, broken links, pages missing from the sitemap, crawler files served with the wrong Content-Type, or a 404 page that can be indexed.

## Deploying on Vercel

Pushing to `main` deploys to production at https://owinz.io. Any other branch or pull request gets a preview deployment with its own URL.

- **Build:** Vercel runs `pnpm build` (migrate → `next build` → SEO audit against `next start`), the same pipeline as locally, unless Project Settings → Build & Development overrides the build command. If the content check or the SEO audit finds an error, the deployment fails and the live site stays as it was. Check the deployment's build log for the `✖ error` lines.
- **Output:** with `output: "export"` in `next.config.ts`, Vercel serves the static `out/` directory. It serves `404.html` for unknown URLs and sets each file's `Content-Type` from its extension. No server code runs at request time.
- **Previews stay out of search.** Vercel sends `X-Robots-Tag: noindex` on preview deployments. Production's `*.vercel.app` alias still serves pages whose canonical URL is `https://owinz.io/…`, so search engines credit the real domain.
- **Analytics:** `<Analytics />` and `<SpeedInsights />` in `app/layout.tsx` report page views and Core Web Vitals. Turn both on in the Vercel project's **Analytics** and **Speed Insights** tabs; until then their scripts at `/_vercel/*` return 404 and nothing is collected. In `pnpm dev` they log to the browser console instead of sending data.
- **Node:** builds were tested on Node 24. Match it in Project Settings → Build & Development → Node.js Version.
- **Once, after the first production deploy:** submit `https://owinz.io/sitemap.xml` in Google Search Console and Bing Webmaster Tools. Bing's index also feeds ChatGPT search and Copilot.

To check a build before pushing, run `pnpm build`, then `npx serve out` to browse the exported site at http://localhost:3000.
