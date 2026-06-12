# Portfolio Completion — Design Spec

**Date:** 2026-06-12
**Goal:** Complete owinz.io to match the approved "Direction A — Warm Editorial" design (claude.ai project `Owinz.io`, files `portfolio-a-*.jsx`), with all content authored as Markdown files, and ship it as a static export hostable on S3.

## Context

The repo is a Next.js 16 App Router site (Tailwind v4, pnpm). The home page and sidebar are built. The writing index, article template, projects index, project detail, talks page, and contact page are stubs, empty files, or broken. A gray-matter + unified markdown pipeline exists in `lib/markdown.ts` with sample content in `content/writing/` and `content/projects/`.

Per `AGENTS.md`: this Next.js version has breaking changes — read the relevant guide in `node_modules/next/dist/docs/` before writing code.

## Decisions (user-confirmed)

- Extend the existing `lib/markdown.ts` architecture; no MDX, no content-codegen layer.
- Talks are markdown files in `content/talks/` (consistent with writing/projects).
- Writing index tag row is a **working client-side filter**.
- Generate a static `feed.xml` RSS feed from writing posts at build time.
- **Light theme only.** Sidebar footer shows `MMXXV` without the ◐ theme toggle.
- Real personal details (below) replace mockup placeholders. No real talks exist yet — the Talks page ships with a "currently scheduling" upcoming state and an "invite me" link instead of fictional talks.

### Real details

- Email: `dyllen@owinz.io`
- GitHub: <http://github.com/djowinz>
- LinkedIn: <https://www.linkedin.com/in/dyllen-owens/>
- Twitter/X: <https://x.com/djowinz>
- Timezone line: `Mountain Time` (no UTC offset — MT shifts between UTC−7 and UTC−6)
- No Mastodon, Are.na, Signal, Berlin/Kreuzberg references — those were mockup fiction.

## Architecture

### Content layer (`lib/markdown.ts`)

Three collections, one `.md` file per item. Frontmatter (gray-matter) is the metadata the renderer uses; the markdown body renders to HTML through the existing unified pipeline (remark-parse → remark-gfm → remark-rehype → rehype-highlight → rehype-stringify).

**Writing frontmatter** (`content/writing/*.md`):

```yaml
title: "On small software"        # required (falls back to "Untitled")
excerpt: "The italic dek shown on index + article header"
date: "March 15, 2026"
category: "Essay"                 # drives tag chip + tag filter
```

Read time/word count stay computed via `reading-time-estimator`.

**Projects frontmatter** (`content/projects/*.md`):

```yaml
title: "Chronicle"
description: "Index-row description / detail-page dek"
purpose: "..."                    # existing field, kept
challenge: "..."                  # existing field, kept
technologies: [React, D3.js]     # stack list
category: "Personal Finance"      # the "kind" label
role: "Design, engineering"       # factsheet
status: "Shipped · v1.3"          # factsheet
platform: "Web"                   # factsheet
order: 1                          # № numbering + sort on index
liveUrl: "https://..."            # optional → "View live" button
sourceUrl: "https://..."          # optional → "Source" button
image: "/projects/chronicle.png"  # optional → figure panel; placeholder panel when absent
launchDate: "March 15, 2026"      # year derived from this
```

**Talks frontmatter** (`content/talks/*.md`):

```yaml
title: "The shape of small software"
date: "May 14, 2026"
venue: "Config, San Francisco"
format: "40 min keynote"
status: "Confirmed"
upcoming: true                    # explicit; defaults to date >= today
links:                            # past talks: artifact chips
  slides: "https://..."
  video: "https://..."
```

Body markdown is optional for talks.

**Loader API** (all return parsed frontmatter + rendered HTML where applicable):

- `getWritingPosts()` / `getWritingPost(slug)` — existing, kept.
- `getProjects()` / `getProject(slug)` — extended with new fields; index sorted by `order`.
- `getTalks()` — new; returns `{ upcoming: Talk[], past: Talk[] }`, past sorted newest-first.
- `getRecentContent(limit, type)` — **bug fix:** sort newest-first (`compareDesc`, currently `compareAsc` shows oldest). Filter to `.md` files (currently unfiltered).

All fields beyond `title` are optional and degrade gracefully (omitted from the UI, never crash).

### Pages

All pages live inside the existing root layout (sidebar + main column) and follow the corresponding `portfolio-a-*.jsx` mockup, translated to Tailwind classes consistent with the existing home page idiom (`font-fraunces`, `text-muted`, `border-edge`, mono masthead, `cursor-none` on links).

1. **`app/writing/page.tsx`** — archive masthead with piece/year counts, `Writing` display heading + italic dek, tag filter row, posts grouped by year (big serif year heading + count, hairline-ruled rows: date / title + tag chip + dek / read time), RSS note card linking `/feed.xml`. The year-grouped list with filtering is a client component fed serialized post metadata from the server page.
2. **`app/writing/[slug]/page.tsx`** — rebuild: back link, mono meta row (category / date / read time), display title, italic excerpt dek, byline strip (name + category; Share/Copy link omitted — static site, no JS clipboard requirement; RSS link kept), article body (`.prose` HTML), footer meta (`Filed under: {category}` / `/ END /`), "Read next" section (2 nearest posts by date). Fix broken imports; add default-export page component.
3. **`app/projects/page.tsx`** — breadcrumb, hero ("Things I've *built*, carefully." per mockup), numbered project rows (№ / title + kind + description + tech / year / hover arrow), "Recent talks" strip (from `getTalks().past`; section hidden while empty), contact footer (pitch + `dyllen@owinz.io` + GitHub/LinkedIn/X links).
4. **`app/projects/[slug]/page.tsx`** — back link, mono meta row (№ / year / category), display title + dek, figure panel (`image` if present, otherwise the styled placeholder panel with `FIG. 01` caption), View live / Source buttons (rendered only when URLs exist), factsheet grid (Role / Year / Status / Platform / Stack), body HTML as § sections via `.prose`, "Next project" footer cycling by `order`.
5. **`app/talks/page.tsx`** — masthead with counts, `Talks` heading + italic dek, **Upcoming** section: when no upcoming talks exist, a single "Currently scheduling" card (accent dot, copy inviting bookings) replaces talk cards; **Past** section rendered only when past talks exist; "What I speak about" + "Booking" two-column footer with `Invite me to speak →` mailto link to `dyllen@owinz.io`.
6. **`app/contact/page.tsx`** — `Correspondence` / `Mountain Time` masthead, "Say *hello*." heading, editorial letter (email link `dyllen@owinz.io`; speaking invitations sentence links mailto, not a form), Channels table (Email / GitHub / LinkedIn / Twitter), "What I reply to / Probably won't reply to" lists, sign-off (`— Dyllen`, RSS link; no PGP/Kreuzberg lines).

Each page exports `metadata` (title/description). The two dynamic routes keep `generateStaticParams` + `generateMetadata`.

### Prose styling

A `.prose` class in `app/globals.css` scoped to rendered markdown, matching the article mockup: 18px Geist body at 1.7 line-height, Fraunces italic `h2`/`h3`, accent-ruled `blockquote` pull quotes (sidebar-bg panel), styled `ol`/`ul`, accent links, hairline `hr`, highlighted code blocks (rehype-highlight classes need a theme — include a minimal highlight.js theme consistent with the palette), drop cap on the first paragraph via `.prose > p:first-of-type::first-letter` (Fraunces, accent color). Used by both article and project detail bodies.

### Static export + RSS

- `next.config.ts`: `output: "export"`, `trailingSlash: true`, `images: { unoptimized: true }`. Verify exact option shapes against `node_modules/next/dist/docs/` (this Next version has breaking changes).
- `feed.xml`: generated at build time from writing posts (hand-rolled RSS 2.0 XML, no new dependency) via an `app/feed.xml/route.ts` route handler marked static so it exports as a file. If this Next version's static-export docs rule that out, fall back to a prebuild script emitting `public/feed.xml`. Site URL constant: `https://owinz.io`.
- `getSeason()` / `format(new Date())` on the home masthead bake the build-time date into the static HTML — acceptable, noted.

### Cleanup

- Remove deleted `components/Menu.tsx` from git (already deleted on disk).
- `metadata.title` template so child pages render `… — owinz.io`.

## Error handling

- Unknown slugs → `notFound()` (404 page included in export).
- Missing optional frontmatter → element omitted (no `undefined` text, no crash). Minimal post (`title` only) must render on index and article pages.
- Empty collections → sections hidden (talks strips) or honest empty state (Talks upcoming).

## Testing

- `pnpm build` (static export) is the gate: must succeed and emit HTML for every route including all slugs and `feed.xml`.
- Manual verification matrix: each page renders with sample content; a minimal-frontmatter post; a project without `liveUrl`/`sourceUrl`/`image`; tag filter narrows and restores; RSS validates as XML.
- `pnpm lint` clean.

## Out of scope

- Dark theme, newsletter, share/copy-link buttons, contact form, comments/"Discuss" link, Direction B (playful) design, deployment automation to S3.
