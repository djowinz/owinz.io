# AI writing assistant: design

**Status:** approved direction (brainstormed with Dyllen 2026-10-26 → 2026-10-31). Ready for an
implementation plan.
**Companion docs:** `2026-10-31-ai-writing-assistant-notes.md` (the full brainstorm record, with
Dyllen's own words) and the mockups in `ai-writing-assistant-mockups/` (open the HTML in a browser).
Where this doc and the notes disagree, this doc wins; where either disagrees with a mockup's
illustrative content, the text wins.

Labels used below: **Decided** = Dyllen's decision. **Call** = Claude's decision, stated to Dyllen,
open to change. **Builder** = left to whoever plans and builds it.

---

## 1. Intent

Dyllen Owens is the only writer on owinz.io and hasn't published a post yet. He always has ideas;
his writing **stalls** between "the shape of the idea is solid" and "a complete, whole article".
He wants an assistant inside the CMS that acts as **researcher, editor, and ghostwriter in his
voice**, and that genuinely **speeds him up**, not just nudges. The articles exist to establish
him as a thought leader, so **quality beats cost**.

**Success for v1:** Dyllen finishes and publishes real articles at 1–2 a month (at most one a
week), and they meet his bar for "ready" (§6).

### Goals
- Turn an idea into a **skeleton** of sections, each with a stated job (§4).
- Turn his **rough notes for a section into a full section in his voice** (§5).
- **Research:** find sources, and check his claims, with citations (§6).
- **Review:** tell him whether the draft is ready against his five criteria, and exactly what to fix (§7).
- Learn and keep his **voice** from a short interview and from his edits (§8).

### Non-goals (v1)
- Engagement tracking (reach, read time, interactions, re-posts, social cards). Separate project;
  §10 records the metrics so it can be scoped later.
- Footnote-style citations (TipTap's Markdown mangles `[^1]`).
- Topic generation / "what should I write about" (he has ideas; not the problem).
- The assistant in the Project or Talk editors (**Call**: posts only for v1).

### Anti-goals (would be a failure even if it works)
- Any AI change to his text or his plan that he didn't accept.
- A heavily customized, fragile editor.
- Generic AI prose that doesn't sound like him; imitating the benchmark writers' text.
- Padding articles to fit a template or fixed section count.
- Storing or quoting his performance evaluations.

## 2. Constraints

- **Decided:** lives in the CMS post editor, beside the draft; calls the **Anthropic API** (not his
  Claude subscription). First AI code in the repo (`@anthropic-ai/sdk`, TypeScript).
- **Decided:** stay on **TipTap**. Keep custom editor code **small and removable**.
- **Decided:** **Markdown stays the source of truth.** Suggestions, highlights, and underlines are
  display-only until accepted; the stored body never contains assistant markup.
- **Decided:** prefer off-the-shelf libraries over hand-rolled code.
- **Decided:** every assistant change to the draft or the skeleton is a **suggestion he accepts or
  rejects**. Nothing silent.
- **Decided:** performance evaluations are read **once**, only to extract author characteristics
  into the voice profile. The files and their content are **never stored, logged, or cited**.
- **Decided:** budget up to **$200/month**; use the strongest model and generous effort where it
  improves quality. **Call:** Claude Opus 5.5 (`claude-opus-5-5`) for everything in v1, streaming
  for drafts; set a monthly spend limit in the Anthropic Console as the hard cap.
- Repo conventions apply (AGENTS.md): Next 16 (read `node_modules/next/dist/docs/` first), server
  actions per route, every action authorizes through `lib/cms/session.ts` → `permissions.ts`,
  Drizzle migrations in `drizzle/`, secrets as Vercel Sensitive env vars named in `.env.example`
  (`ANTHROPIC_API_KEY`), Vitest + Playwright e2e.
- **Call:** the assistant is available to **editor** and **writer** roles (they can publish; it
  costs money). Contributors don't see it.

## 3. Layout (Decided, see mockups)

Matches the existing CMS look exactly: Fraunces light/italic headings, Geist body, Geist Mono
uppercase 10px labels, square corners, hairline `--edge` borders, `--sidebar` shade, `--accent`
violet, `components/admin/ui.tsx` button styles.

- **Full-width CMS.** Drop the centered `max-w-7xl` shell in `app/admin/(app)/layout.tsx`. The post
  editor becomes **rail (232px) | writing column (keeps `max-w-[820px]`) | right panel (~520px,
  full viewport height, `--sidebar` background, own scroll)**.
- **Every CMS page adopts the full-width shell.** Content widths per page are **Builder**, with
  one rule: nothing should look stretched (lists and forms keep sensible max widths inside the
  wider shell).
- **One right panel, two views.** Top row: a two-way switch **Assistant | Site preview** and ✕.
  Below it (assistant view only): tabs **Shape · Write · Research · Review**. Switching views keeps
  assistant state. The existing site-preview column becomes this panel's second view; the editor's
  "Site preview" toggle becomes a single **Hide panel**. "Preview ↗" (new tab) stays.
- **Accepted tweaks:** violet dot on "Assistant" when a suggestion waits while the preview shows;
  a keyboard shortcut to flip views (e.g. ⌘\ / Ctrl+\); the panel reopens on the last view used
  (per-browser preference is fine).
- **Panel anatomy:** scrolling body; a **reply box and the next action pinned to the bottom**.
- **Below `lg`** (**Call**): the editor's existing Write/Preview tabs gain a third tab, Assistant.
- **Suggestions in the editor:** a block with a violet left rule and faint tint, a label
  ("Suggested · section 02"), and **Accept** / **Reject**. Accept inserts plain Markdown content;
  Reject removes it. A suggestion whose surrounding text is edited before acceptance is dropped
  (or re-anchored if trivially possible: **Builder**).
- **Annotations in the editor** (Research underlines, Review flags) are display-only decorations.

**Call (implementation shape):** suggestions and annotations are ProseMirror **decorations** from
**one** TipTap extension, never nodes in the document, so they can't leak into the Markdown and the
feature can be removed by deleting the extension.

## 4. Shape: idea → skeleton

- He types the **idea** (a few sentences). The assistant proposes a **skeleton**: ordered sections,
  each with a title and a one-line **job** ("Show the chart. Prove it's real, not noise.").
- **No fixed section count.** The count follows the argument; every section must state its job;
  the assistant proposes merging or cutting sections that don't earn their place.
- The skeleton is a **working plan, not a contract.** He can add, rename, reorder, split, merge,
  or delete sections at any time, directly or by asking in the reply box.
- Section status: **Written / You're here / Next / Planned**. "Written" is derived from the draft
  (the section's heading exists with content under it); "You're here" follows the cursor or the
  section open in Write.
- **Drift is suggested, never silent.** When the draft stops matching the skeleton, or a section
  stops meeting the §7 criteria, the assistant explains why and proposes a specific skeleton change
  ("03 now makes two arguments; split into 03 and 04?"). Accept applies it; dismiss keeps the plan.
  When drift is checked (on demand, after accepting a draft, during Review) is **Builder**.
- Skeleton sections map to `##` headings in the draft. No placeholders for unwritten sections in
  the editor.

## 5. Write: notes → section

- Shows: section strip (`01 ✓ · 02 … · 03`), the current section's **job**, and a **notes** box.
- He jots rough notes (fragments, numbers, "say X, then the story about Y"). **Draft** produces the
  full section **in his voice**, inserted under that section's heading as a **suggestion**.
- Redirect chips (**Shorter**, **More direct**, **Less hedging**, **Lead with the …**) and free text
  in the reply box produce a new suggestion in place of the pending one. "Draft again" re-rolls.
- Pinned next action: **Next: <next section> →**.
- Drafting from notes is the primary mode. Drafting from the job alone (no notes) is allowed but
  not encouraged; the UI should nudge him to add notes.
- The prompt for drafting includes: voice profile, idea, skeleton, the section's job and his notes,
  and the surrounding draft (so transitions read naturally).

## 6. Research

Two modes via a segmented control: **Find sources** and **Check my claims**, scoped to the current
section or the whole draft.

**Check my claims** sorts each statement into one of four kinds. Only factual claims get a
true/false verdict:

| Kind | Signals | Verdicts and actions |
|---|---|---|
| **Factual claim** | numbers, events, attributions | **Supported** (source + "Add citation", "Show passage") / **Overstated** (suggested wording: "Use suggested wording" / "Keep mine") / **No source found** ("Mark as my own data" / "Soften" / "Ignore") |
| **Prediction** | "will", "by 2028", "is going to" | **Grounded** (source for the underlying trend) / **Speculative** (allowed, never an error; a bold call can be the point) |
| **Opinion / argument** | "I think", "teams should", his thesis | Not checked here (Review judges the argument) |
| **His own data or experience** | "our team", "last quarter we" | No outside source needed, but **must be objective** ("numbers or objective data, not vibes"): a performance claim without a number, measurement, or chart is flagged **Unquantified** and he's asked for the figure. Anecdotes told as stories are fine. |

- Numbers in prose are **cross-checked against the post's own chart blocks** (```chart fences parsed
  with `lib/charts/spec.ts`), and mismatches flagged.
- When a statement's kind is ambiguous, ask ("claim or your view?"); his answer sticks for the draft.
- Each checked claim gets a thin underline in its verdict's color in the editor (green / amber / red).

**Find sources** works from the section's job and notes, offers facts each with a source, and each
accepted fact lands as a suggestion with its citation.

**Citations:** an inline Markdown link on the supported phrase, plus an entry in a `## Sources`
list at the end of the post (created on first citation, de-duplicated by URL).

**Tools (Call):** Anthropic server tools `web_search` and `web_fetch` (`*_20260209` variants on
Opus 5.5). Every cited URL must come from an actual search/fetch result; the assistant never
invents a source.

## 7. Review: "is it ready?"

Dyllen's five criteria, verbatim intent:
1. **Complete:** all the right pieces (checked against the skeleton).
2. **Professional:** reads professionally.
3. **Carries weight:** has weight or importance.
4. **Engaging.**
5. **Pulls to the bottom:** makes the reader want to finish.

**Benchmark qualities** (from writers he named; describe the qualities, never imitate or quote their
text): **Dave Barry:** humor and timing that keep you reading. **Zeynep Tufekci:** treating a
tech/social trend seriously and showing why it matters beyond the obvious. **Ezra Klein:** building
an argument step by step so the reader ends up somewhere new.

Output: a one-line plain-language verdict; one row per criterion with **Strong / Good / Needs
work**, a specific reason, and an action ("Go to 04 in Write", "Suggest a rewrite" → a suggestion,
"Show me" → scroll to and flag the passage). Flags in the editor are display-only. **Review never
blocks Publish**, and the existing publish checks (`checkAction`) are unchanged. "Review again" re-runs it.

## 8. Voice profile

- **Sources:** a guided **typed interview** (no existing writing samples exist), plus optional
  performance evaluations read once (§2). Seed posts in `content/writing` are not his voice.
- **Interview:** **short rounds over a few days** (Decided). He can start drafting after round one.
  **Call:** ~5–7 questions per round; rounds cover voice and tone, pacing and sentence rhythm,
  grammar and punctuation habits, structure preferences, interests, likes and dislikes, and how he
  wants to come across. His typed answers also count as writing samples. Exact questions: **Builder**.
- **The profile is plain text he can read and edit in the CMS** (**Call**: a "Voice" page in the
  admin rail, editor/writer only).
- **Learning from edits (Call):** when he edits an accepted section, the assistant may propose
  profile updates ("you cut every 'really'; add 'avoid intensifiers'?"). Each needs his approval.
- Evaluations upload: processed in memory for a single extraction call; the output is a proposed
  profile diff he approves; the file is not written to Blob, the database, or logs.

## 9. Data (Builder, with requirements)

Per post: the idea, the skeleton (ordered sections: id, title, job, status), per-section notes,
and claim classifications he chose ("claim or your view?") must **persist across sessions and
devices** (store in Postgres, keyed to the post; new Drizzle tables). Per site: the voice profile
and interview progress. Pending suggestions, Research results, and Review results may be ephemeral
(re-run on demand). None of this goes into post revisions or the published snapshot.

## 10. Value metrics (for the separate tracking project)

Dyllen measures value by **reach, average read time, interactions with interactive elements (e.g.
charts), re-posts, and social card interactions**. Today only Vercel `<Analytics />` page views
exist. Later, Review could learn from his own published pieces what performs.

## 11. Mockups

| File | Shows |
|---|---|
| `shape.html` | Shape tab, full-width layout, panel header with switch + tabs |
| `write.html` | Write tab; drafted section as a suggestion with Accept/Reject in the editor |
| `research.html` | Check my claims: verdict cards, colored underlines in the editor |
| `review.html` | Review: verdict, five criteria, flagged paragraph in the editor |
| `site-preview.html` | Panel switched to Site preview (older header; use the two-row header from the others) |

Article text, numbers, and the `example-research.org` source in the mockups are illustrative.

## 12. Builder-check answers (2026-10-31)

A fresh reviewer read this doc cold. Their questions and the answers:

- **Whose voice profile? (Call, supersedes §8/§9 "per site").** Profiles are **per user**: each
  editor/writer has their own interview, profile, and learning-from-edits, keyed by user id. One
  writer's edits never change another's profile. Today that's just Dyllen.
- **Raw Markdown mode (Call).** The assistant's editor features (suggestions, underlines, flags)
  work in **Visual** mode only. In Markdown mode the panel stays usable (Shape, notes, chat,
  Review/Research results as text), but insert actions say "Switch to Visual to insert". Switching
  to Markdown with a suggestion pending keeps it in the panel and re-shows it on return if its
  anchor still exists; otherwise it's offered again from the panel, never silently lost.
- **Linking skeleton sections to `##` headings (Call).** Each skeleton section has a stable id in
  the database and is matched to a heading by text. If he renames a heading in the editor, that's
  **drift**: the assistant suggests renaming the skeleton section to match (one click). It never
  renames silently. Unmatched headings show as "not in the plan" with an offer to add them.
- **Existing drafts (Call).** Shape has a second entry point: **build a skeleton from my draft**,
  which proposes sections from the headings and text already written (for drafts that predate the
  assistant).
- **Learning from edits (Call).** Persist the text of each **accepted** suggestion (per post,
  section, and user). Profile-update proposals are generated **on publish** and on demand ("Learn
  from my edits" on the Voice page) by comparing the accepted text with his final version. Each
  proposal needs his approval.
- **Evaluations (Decided).** Sending evaluation text to the Anthropic API for the one extraction
  call is fine; **Anthropic's standard API retention is acceptable** (no zero-data-retention
  needed). The profile records **style traits only** ("concise", "direct"), never what evaluators
  said, quoted or paraphrased. Our side still never stores, logs, or cites the files (§2, §8).
- **Release order (Decided).** The **full-width CMS shell ships first as its own release** (all
  admin pages, their e2e tests), through the normal dev → preview → production flow. The assistant
  builds on top of it as a second release. Plan them as two separate plans.

## 13. Left to the builder

Exact prompts; streaming transport (route handler under `app/api/cms/` vs server actions); table
design; the decoration extension's internals; per-page content widths in the full-width shell;
when drift checks run; interview question wording; error and rate-limit handling (show a plain
message, never lose his notes); tests (unit for parsing/classification glue, e2e with the API
mocked, never calling the real API in CI).
