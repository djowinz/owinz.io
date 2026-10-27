<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# How this repo works

Personal site and CMS for Dyllen Owens. Read this before exploring; verify anything you rely on, since code moves faster than this file.

## Hosting and runtime
- Deployed on **Vercel** (git integration, no `vercel.json`, no CI workflows). `dev` branch gets a preview deploy. It is **not** a static export: `next.config.ts` uses `cacheComponents` + `partialPrefetching`, and publishing refreshes cache tags instead of rebuilding. (`README.md` and the leftover `out/` dir are stale on this point.)
- Next 16: middleware lives in `proxy.ts` (only redirects `/admin/*` without a session cookie).
- `pnpm build` = `db:migrate` → `db:seed` → `next build` → `scripts/seo-audit.mjs`.
- Data: Neon Postgres via Drizzle (`lib/db/`, migrations in `drizzle/`). Local Postgres via `docker-compose.yml` (port 54322). Photos in Vercel Blob (`lib/blob.ts`), `.data/blob/` locally.
- Secrets are Vercel Sensitive env vars (`vercel env pull` writes placeholders); names in `.env.example`.

## Content model
- **Postgres is the source of truth** for writing, projects, and talks. `content/` holds seed/legacy markdown only. `pnpm content:export` / `content:import` round-trip markdown.
- Tables: `posts`, `projects`, `talks`, `terms` + `postTags`/`projectTags`, `assets`, `revisions` (jsonb snapshots).
- Bodies are Markdown. Publishing (`lib/content/publishing.ts`) snapshots the draft into a revision; the public site renders the published snapshot, never the live draft. Keeps last 10 published + 50 autosave revisions. Talks have no history.
- Validation: `lib/cms/validate*.ts`, `scripts/validate-content.mjs`.

## CMS (`/admin`)
- Routes: `app/admin/(app)/{writing,projects,talks,taxonomy,users}` with server actions in each `actions.ts`; draft preview at `app/admin/preview/writing/[id]`; route handlers under `app/api/cms/`.
- Auth: Better Auth (`lib/auth.ts`), GitHub OAuth, invite-only (`pnpm cms:invite`); local dev magic link printed to terminal. Every action authorizes via `lib/cms/session.ts` → `lib/cms/permissions.ts`.
- Roles: `editor` (everything incl. delete, users), `writer` (create/edit/publish/unpublish/restore/taxonomy), `contributor` (create; edit own only while never published — `firstPublishedAt` is never cleared).
- Editor: TipTap v3 + `@tiptap/markdown` (`components/admin/editor/RichEditor.tsx`, schema in `lib/cms/editor-schema.ts`), raw mode in `MarkdownField.tsx`. `PostEditor.tsx` = sticky action bar + write column (max 820px) + optional preview column at `lg`; tabs on mobile. Autosave 1.5s debounce / ⌘S with optimistic concurrency (`baseUpdatedAt`). Publish runs `checkAction` (errors block, warnings confirm).

## Stack and style
- Next 16.4, React 19.2, Tailwind v4, `cn` in `lib/utils.ts`, lucide-react, next-themes, recharts. No component library; custom listbox in `components/admin/Select.tsx`.
- CMS UI primitives in `components/admin/ui.tsx`. Look: Fraunces (light/italic headings), Geist Sans body, Geist Mono uppercase 10px labels; square corners, thin borders; tokens in `app/globals.css` (light bg `#f8f7f4`, accent violet `#7c3aed`; dark bg `#141311`, accent `#b69bff`).
- Tests: Vitest against PGlite (`tests/`), Playwright e2e via `e2e/run.mjs`.
- Analytics: Vercel `<Analytics />` + `<SpeedInsights />` in `app/layout.tsx` only. `components/ReadingProgress.tsx` is visual, emits nothing.
- No AI/LLM code or dependencies yet. `lib/llms.ts` only serves `llms.txt` for crawlers.

## Persona sources
- `lib/site.ts` (name, tagline, socials, email), hero copy in `app/(site)/page.tsx`, contact likes/dislikes in `app/(site)/contact/page.tsx`. No about/resume/interests file. Seed posts in `content/writing` are placeholder text, not a reliable voice sample.

## Docs
- Specs and plans: `docs/superpowers/specs/`, `docs/superpowers/plans/`.
