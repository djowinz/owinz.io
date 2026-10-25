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

### Signing in

The CMS lives at `/admin` (sign-in at `/admin/login`). Sign-in is GitHub-only and invite-only: an account is created only for an email an editor has invited, and the invite sets the role. Editors manage people at `/admin/users`. Removing someone deletes their account and sessions; their content stays.

- **First editor:** `pnpm cms:invite you@example.com editor` (run against the right database), then sign in.
- **Per environment:** set `BETTER_AUTH_SECRET` (`openssl rand -base64 32`; the CMS refuses to run without it) and a GitHub OAuth app's `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`. GitHub allows one callback URL per app, so create one app each for production (`https://owinz.io/api/auth/callback/github`), previews (the `dev` branch URL, `https://owinz-io-git-dev-…vercel.app/api/auth/callback/github`), and local development (`http://localhost:3000/api/auth/callback/github`).
- **Locally without GitHub:** with `OWINZ_IO_DEV_LOGIN=1`, `pnpm dev`, and a localhost database, the sign-in page also offers an email link that is printed to the terminal. It is off in production builds, on Vercel, and against any non-local database.

Every admin page and server action checks the session and role itself (`lib/cms/session.ts`); `proxy.ts` only redirects signed-out visitors early. `/admin` and `/api` are `noindex` and disallowed in `robots.txt`.

### Writing in the CMS

`/admin/writing` lists every post with its status; **New post** opens the editor.

- **Editor.** A visual editor (TipTap) that reads and writes Markdown, so the stored format and everything built from it are unchanged. It uses the site's article styles, so what you see is what's published. Switch to **Markdown** to edit the source directly; **Site preview** shows the post through the site's own renderer.
- **Photos.** Drop or paste them into the text, or upload from the tray. Large photos are shrunk in the browser, then rotated, resized, recompressed, and stripped of metadata on the server. Select a photo to set its alt text, caption, and placement (left, center, right).
- **Saving.** Drafts autosave 1.5 seconds after you stop typing (⌘S saves immediately), and only when something changed. If someone else saved the post after you opened it, your save stops and asks you to reload instead of overwriting them.
- **Publishing.** Publish runs the content checks: errors (missing title, a photo that isn't uploaded, a bad placement tag) block it; warnings (excerpt length, missing alt text) ask first. Publishing refreshes the post's cache tag, so the article, archive, home page, RSS, sitemap, and `llms.txt` update within a second, with no rebuild. Editing a live post never changes the page until you publish again.
- **History.** Restore any of the last 10 published versions or 50 autosaves into the draft. The current draft is saved to history first, so a restore can itself be undone.
- **URLs.** A new post's URL follows its title (taking the next free one if needed) until it's first published; after that it changes only when edited, with a warning that old links will break.
- **Preview.** **Preview ↗** saves the draft and opens it at `/admin/preview/writing/<id>/`, rendered by the same component as the live article (`components/ArticleView.tsx`) inside the site's chrome, under a "Draft preview · not published" bar. It's signed-in only, `noindex`, and rendered per request (never cached); draft photos load through the signed-in photo route.
- **Export.** **Export .md** downloads the saved draft as Markdown with YAML frontmatter (title, date, updated, excerpt, category, tags, byline, and `status`), in the same format as `content/writing/`.

### Exporting and re-importing content

```bash
pnpm content:export [dir]        # every post, drafts too → <dir>/writing/<slug>/index.md + photos (default .data/export/)
pnpm content:import [dir]        # load a content folder (default content/) back into the database
```

The export writes each post's working draft. Frontmatter records `status: draft | published`, and `unpublishedChanges: true` marks a live post whose draft differs from what the site shows; re-importing publishes everything except `status: draft` posts, so such a post goes live with its draft. Photos are read from storage (`lib/blob.ts`) and re-processed on import. `tests/content-export.test.ts` checks the round trip.

### Categories and tags

Categories and tags are records in the database (`terms`), not free text, so a typo can't create a second "Engineering".

- **In the editor,** pick a category from the list and add tags as chips (Enter or comma); typing a tag that doesn't exist yet creates it, and an existing name (any capitalization) is reused.
- **Categories & tags** (`/admin/taxonomy`, editors and writers) renames, re-URLs, describes, reorders, merges (tags), and deletes them. Posts and every saved version refer to terms by id, so a rename shows on every live page at once without republishing. Only unused terms can be deleted; merge a tag into another instead.
- **On the site,** the archive filters by category and tag. Each category with live posts has an indexed page at `/writing/category/<slug>/` (its description is the intro and meta description, and it's in the sitemap); each tag has a browsable `/writing/tag/<slug>/` page that's `noindex`. Articles link their category and tags.
- Post URLs `category` and `tag` are reserved.

`tests/editor-roundtrip.test.ts` round-trips every post and project through the editor and checks the site renders them identically.

### Local setup

Everything runs offline: Postgres in Docker, and photos in `.data/blob/` instead of Vercel Blob.

```bash
cp .env.example .env.local     # local defaults
pnpm db:up                     # start Postgres (docker compose, port 54322)
pnpm db:migrate                # create the tables
pnpm content:import            # load content/ into the database (photos → .data/blob/)
pnpm cms:invite you@example.com editor   # first CMS account
pnpm dev                       # http://localhost:3000, CMS at /admin
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

## Dynamic routes and real 404s

Pages with a `[slug]` (`/writing/<slug>/`, `/writing/category/<slug>/`, `/writing/tag/<slug>/`) prerender every known slug and return a real HTTP 404 for an unknown one on its very first request. Each follows the pattern in `lib/static-params.ts`; new dynamic routes (such as `/projects/[slug]`) should copy it:

```tsx
export const ensureStatic = "navigation"; // wait for the full static render of an unlisted URL
export const instant = false;            // params are read outside <Suspense> (see below)

export async function generateStaticParams() {
  return withPlaceholder((await getThings()).map((t) => ({ slug: t.slug })));
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const thing = found(await getThing(slug)); // a "use cache" getter; found() calls notFound()
  // …
}
```

- **Why.** With Cache Components and Partial Prefetching, Next.js answers a URL that `generateStaticParams` didn't list with the route's prerendered fallback shell. The shell starts streaming, which fixes the status at 200 before the page reaches `notFound()`, so the first visit to a bad URL was a "soft 404". `ensureStatic = "navigation"` makes Next.js render the whole page before responding instead, so `notFound()` still sets 404.
- **Cost.** None at request time. Known pages stay fully static. An unknown URL is rendered once, and its 404 is cached like any page until a publish refreshes the content tag, so a slug that 404'd starts working as soon as something is published there. The build enforces that every data read on these routes is cached (`"use cache"`). An uncached query fails the build instead of slowing the page.
- **Keep `params` out of `<Suspense>`.** Reading `params` inside a Suspense boundary also returns 404, but the prerendered content then arrives as an out-of-order segment (a hidden `<div>` swapped in by a script), which crawlers that don't run JavaScript can miss. `instant = false` silences the dev-only "encountered URL data" check that awaiting `params` at the top would trigger. These pages are prerendered per slug, so navigating to them is fast anyway.
- **The 404 page** for these routes is Next.js's minimal error document with `noindex`; the not-found UI renders in the browser.

## End-to-end tests

```bash
pnpm db:up
pnpm test:e2e                    # fresh database → migrate → seed content/ → next build → next start → flows
pnpm test:e2e --reuse-build      # skip next build when .next already has one
pnpm test:e2e --only=writing     # only flow files whose name contains "writing"
pnpm test:e2e --screenshots=dir  # also save screenshots (light and dark)
pnpm test:e2e --headed           # watch it
```

`e2e/run.mjs` creates its own database (`owinz_e2e_<random>`) on the local Postgres from `OWINZ_IO_DATABASE_URL` (or `E2E_DATABASE_URL`), runs the migrations, seeds `content/`, builds, and starts `next start` on a free port between 4300 and 4399. It signs in by inserting an editor, a writer, and a contributor with sessions and setting Better Auth's signed session cookie. Then it drives Chrome with Playwright through `e2e/flows/*.mjs` in file order. Afterwards it drops the database and deletes the photos the run stored in `.data/blob/`. Flows wait for conditions (`eventually()` in `e2e/lib.mjs`, Playwright's auto-waiting) instead of sleeping.

- `01-access`: signed-out visitors are sent to sign-in, signed-in users land on the overview, and a forged cookie gets nothing.
- `02-writing`: create a post (autosave, "Saved"), pick a category and add new tags, upload a photo from the tray, publish (the article, category, tag, archive, and sitemap update without a rebuild), edit without changing the live page until **Update live**, restore from history, preview the draft, export Markdown, rename a category and see it live, and unpublish.
- `03-roles`: contributors draft but can't publish or edit others' posts, and People is editor-only.
- `04-not-found`: unknown dynamic URLs return 404 on the first request.

To add flows, create `e2e/flows/NN-name.mjs` exporting `flows = [{ name, run(ctx) }]`. `ctx` has `base`, `browser`, `pg` (a client on the test database), `sessions.{editor,writer,contributor}`, `contextFor(session)`, `fixture(name)` (`e2e/fixtures/`), and `state`, which is shared across flows.

## Build guardrails

- `scripts/validate-content.mjs` checks the Markdown in `content/` (missing titles or dates, bad URLs and slugs, missing photos, alt text). It runs before `pnpm content:import`; in the CMS milestones the same checks move into saving.
- `scripts/seo-audit.mjs` crawls the running site after `next build` (or any deployment: `pnpm seo:audit https://…`). It starts at the sitemap and follows every internal link. It fails on a missing or duplicate title, a missing description or canonical, a canonical that doesn't match the page URL, missing Open Graph tags, an og:image or photo that doesn't load as an image, any count of `<h1>` other than one, invalid JSON-LD, images without `alt`, broken links, pages missing from the sitemap, crawler files served with the wrong Content-Type, or a 404 page that can be indexed.

## Deploying on Vercel

Pushing to `main` deploys to production at https://owinz.io. Any other branch or pull request gets a preview deployment with its own URL.

- **Separate data per environment.** Production uses the `neon-owinz-io` database and `owinz-io-blob` store; previews use `neon-owinz-io-preview` and `owinz-io-preview-blob`. Both pairs write the same `OWINZ_IO_*` variable names, scoped to their environment (`vercel storage status`), so nothing a preview does, including deleting posts and their photos, can touch production. Both Blob stores are private; photos are served through the site.
- **CMS settings per environment:** `BETTER_AUTH_SECRET` (different for production and preview), `OWINZ_IO_FIRST_EDITOR` (the email invited as editor on a fresh database), and a GitHub OAuth app's `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`. Preview callbacks use the `dev` branch URL: `https://owinz-io-git-dev-dyllen-owens-projects.vercel.app/api/auth/callback/github`.
- **First build on a fresh database:** `pnpm db:seed` imports `content/` and invites `OWINZ_IO_FIRST_EDITOR`, but only when the database has no content and no accounts at all; otherwise it does nothing.
- **Build:** Vercel runs `pnpm build` (migrate → seed → `next build` → SEO audit against `next start`), the same pipeline as locally, unless Project Settings → Build & Development overrides the build command. If the content check or the SEO audit finds an error, the deployment fails and the live site stays as it was. Check the deployment's build log for the `✖ error` lines.
- **Output:** with `output: "export"` in `next.config.ts`, Vercel serves the static `out/` directory. It serves `404.html` for unknown URLs and sets each file's `Content-Type` from its extension. No server code runs at request time.
- **Previews stay out of search.** Vercel sends `X-Robots-Tag: noindex` on preview deployments. Production's `*.vercel.app` alias still serves pages whose canonical URL is `https://owinz.io/…`, so search engines credit the real domain.
- **Analytics:** `<Analytics />` and `<SpeedInsights />` in `app/layout.tsx` report page views and Core Web Vitals. Turn both on in the Vercel project's **Analytics** and **Speed Insights** tabs; until then their scripts at `/_vercel/*` return 404 and nothing is collected. In `pnpm dev` they log to the browser console instead of sending data.
- **Node:** builds were tested on Node 24. Match it in Project Settings → Build & Development → Node.js Version.
- **Once, after the first production deploy:** submit `https://owinz.io/sitemap.xml` in Google Search Console and Bing Webmaster Tools. Bing's index also feeds ChatGPT search and Copilot.

To check a build before pushing, run `pnpm build`, then `npx serve out` to browse the exported site at http://localhost:3000.
