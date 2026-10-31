# AI writing assistant: brainstorm record

**Status:** brainstorm complete. **The design doc is `2026-10-31-ai-writing-assistant-design.md`
(builder-checked); it supersedes this record where they differ.** Planning happens next, possibly
on another machine: two plans, the full-width CMS shell first, then the assistant.
**Next step:** turn this into `YYYY-MM-DD-ai-writing-assistant-design.md` (design doc, then builder
check, then implementation plan). Everything below is either **decided by Dyllen**, **my call
(Claude), stated to him and open to change**, or **open**. When they conflict, Dyllen's decisions win.

Timeline: started 2026-10-26, paused for inline charts (shipped to production 2026-10-27), resumed
and mocked up 2026-10-31.

**Mockups** (built from the real CMS styles; open the HTML files in a browser):
`docs/superpowers/specs/ai-writing-assistant-mockups/`
| File | Shows |
|---|---|
| `shape.html` | Shape tab: idea → skeleton of sections, "you're here", assistant note |
| `write.html` | Write tab: section job, your notes, drafted section as a suggestion in the editor |
| `research.html` | Research tab, "Check my claims": verdict cards + colored underlines in the editor |
| `review.html` | Review tab: "is it ready?", five criteria with verdicts, flagged paragraph in the editor |
| `site-preview.html` | The same right panel switched to Site preview |

The mockups' content (the lead-time/MTTR article, sources, numbers) is illustrative only. The
`example-research.org` source in `research.html` is a placeholder, not a real reference.

---

## 1. Why this exists

Dyllen is the only writer on owinz.io and **hasn't published a post yet**. He doesn't lack ideas:
"I can always find something to write about I just struggle at writing in a good or productive
way." The writing **stalls**: "the overall abstract shape of the idea is solid, but the what comes
next to make it a complete or whole article is what struggles."

He wants a collaborator inside the CMS that acts as **researcher, editor, and ghostwriter in his
voice**, and that **speeds him up**, not just nudges: "accelerate my ability to write articles not
just through subtly guiding me, but to also helping me move through those things faster."

The articles are meant to **establish him as a thought leader and build career momentum**.

**Success for v1:** real articles get finished and published, at Dyllen's pace of **1–2 a month,
at most one meaningful piece a week**, and they meet his bar for "ready" (section 6).

**Anti-goals:** a heavily customized, fragile editor; an assistant that silently changes his text
or his plan; generic AI prose that doesn't sound like him; padding articles to fit a template.

## 2. Hard constraints (decided)

- **Lives in the CMS editor**, next to the draft. Calls the **Anthropic API** (not his Claude
  subscription). This is the repo's first AI code (AGENTS.md: "No AI/LLM code or dependencies yet").
- **Stay on TipTap.** BlockNote was considered and rejected (lossy Markdown; its AI features are
  GPL or paid). Keep custom editor logic **small and removable**.
- **Markdown stays the source of truth.** Nothing the assistant shows (suggestions, highlights,
  underlines) is saved into the post until Dyllen accepts it.
- **Prefer off-the-shelf libraries** over hand-rolled code ("leverage an OTSS before we roll our own ever").
- **Never changes his text or his plan silently.** Every AI change is a suggestion he accepts or rejects.
- **Performance evaluations** (a voice source, section 7) are read once for author characteristics
  only. **The files and their contents are never stored and never cited.**
- **Quality over cost.** Up to **$200/month** is fine (section 9).

## 3. The workflow

A loop of four steps, one tab each in the assistant panel:

1. **Shape:** he types the idea; the assistant proposes a **skeleton** of sections, each with a
   one-line **job**. They refine it by conversation.
2. **Write:** per section, he **jots rough notes** (fragments, "say X, then the story about Y");
   the assistant **drafts the full section in his voice** as a suggestion in the editor. He
   accepts, rejects, or redirects ("shorter", "less hedging", or free text). When he stalls, it
   shows where he is in the skeleton and what could come next.
3. **Research:** **find sources** for what a section needs, or **check claims** he's already made.
   Facts land with citations, as suggestions.
4. **Review:** "is this ready?" against his five criteria, pointing at the exact spot and the fix.

Confirmed details:
- Drafting **from his notes** is the main mode (he stays the source of substance; it does the heavy
  lifting on prose). Drafting a section from only its job, with no notes, is not preferred.
- The flow is not strictly linear: he can jump between tabs any time.

## 4. Shape and the skeleton

- **The assistant proposes the breakout.** The skeleton is a **working plan, not a contract**:
  writing reveals the real shape, so sections can be added, split, merged, reordered, or cut at any
  point, and the count updates.
- **No fixed section count.** The number follows the argument (a tight opinion piece might be
  three, a deep explainer eight). Each section must state its job; the assistant offers to merge
  or cut sections that don't pull weight rather than pad. (Dyllen rejected a fixed count as
  "obtuse and unsubstantiated".)
- **Drift is suggested, never silent.** When what's written stops matching the skeleton, or stops
  meeting the success criteria, the assistant says why ("03 now makes two separate arguments") and
  **suggests** a specific update ("split into 03 and 04?"). He accepts or dismisses.
- Each section shows a status: **Written / You're here / Next / Planned**.
- Unwritten sections do **not** appear as placeholders inside the editor (that would need custom
  TipTap code); the skeleton lives only in the panel.

## 5. Research

Two modes, both wanted: **Find sources** (works from the section's job and his notes, offers facts
with sources, each landing as a suggestion) and **Check my claims** (scans a section or the whole
draft).

Every statement is sorted into one of four kinds; **only factual claims get a true/false verdict**:

| Kind | Examples | Treatment |
|---|---|---|
| **Factual claim** | numbers, events, who said what | **Supported** (source, "Add citation") / **Overstated** (suggested softer wording, "Keep mine") / **No source found** (cut, soften, or mark as his data) |
| **Prediction** | "will", "by 2028", "is going to" | Never true/false. Checked for **grounding**: framed as a prediction? evidence for the trend? → **Grounded** (with a source for the trend) / **Speculative** (allowed: a bold call is often the point; he just sees he's out on a limb) |
| **Opinion / argument** | his thesis, "I think", "teams should" | Not fact-checked. Review judges whether it's argued well. |
| **His own experience or data** | "our team", "last quarter we" | No outside source needed, **but it must be objective**: "numbers or objective data, not vibes" (Dyllen). A performance claim needs a number, measurement, or chart; "incidents got way worse" is flagged **Unquantified** and the assistant asks for the figure. A story told as a story is fine. |

- Numbers in the prose are **cross-checked against the post's own chart data** (e.g. "dropped by
  more than half" vs a chart showing 6.2 → 2.5), and mismatches are flagged.
- Classification comes from the wording (tense, modal verbs, who the sentence is about). When
  ambiguous, it asks ("claim or your view?"); his answer sticks for the rest of the draft.
- In the editor, checked claims get a thin underline in the verdict's color (display only, never
  saved).
- **Citations:** inline links plus a **Sources** list at the end of the post. (Footnotes later:
  TipTap's Markdown would mangle `[^1]`.)

## 6. Review

Answers his real reason to hesitate before publishing: "I didn't feel it was ready or good enough."
His five criteria, in his words:

1. **Complete:** does it have all the right pieces? (checked against the skeleton)
2. **Professional:** does it read professionally?
3. **Carries weight:** does it carry weight or importance?
4. **Engaging:** is it engaging?
5. **Pulls to the bottom:** does it make the reader want to get to the bottom?

**Benchmark writers** for "professional" and "carries weight": **Dave Barry, Zeynep Tufekci, Ezra
Klein**, used as a bar for *qualities* described in plain words, **never as text to imitate or quote**.
Confirmed meaning:
- **Barry:** humor and timing that keep you reading.
- **Tufekci:** treating a tech/social trend seriously and showing why it matters beyond the obvious.
- **Klein:** building an argument step by step so the reader ends up somewhere new.

Output (see `review.html`): a plain-language verdict ("Close. Two things stand between this and
publish."), one row per criterion with a verdict (Strong / Good / Needs work), a specific reason,
and an action (e.g. "Go to 04 in Write", "Suggest a rewrite", "Show me"). Flagged passages are
marked in the editor (display only). Review never blocks publishing; Publish stays his call.

Review also runs the drift check from section 4 against these criteria.

## 7. Voice profile

- **Sources:** a **guided, typed interview only** (Dyllen has no existing writing samples: no
  LinkedIn, Slack, docs, or old posts), plus the read-once performance evaluations (section 2).
  The seed posts in `content/writing` are placeholder text, not his voice.
- **Interview format:** **short rounds over a few days**, not one long session. He can start
  drafting after the first round; each round sharpens the profile.
- **My calls:** his typed interview answers double as writing samples (real sentence rhythm, not
  just answers). Once he's drafting, **the edits he makes to its sections** are the strongest voice
  signal; the assistant proposes profile updates from them, **each needing his approval**. The
  profile is editable plain text in the CMS.
- Covers voice, pacing, grammar, style, interests, likes and dislikes.

## 8. Layout and UI (approved 2026-10-31)

Built to match the existing CMS exactly: Fraunces (light, italic) headings, Geist body, Geist Mono
uppercase 10px labels, square corners, hairline `--edge` borders, `--sidebar` shade, violet
`--accent`, the `ui.tsx` button styles. The first mockup was rejected for not looking like the
real CMS; the second for being "VERY condensed".

- **Full-width CMS.** The editor page drops the site's centered `max-w-7xl` column: **rail (232px)
  | writing column (keeps its 820px max for readable lines) | right panel (~520px, full height,
  `--sidebar` background, scrolls on its own)**.
- **Every CMS page moves to the full-width format**, not just the editor (Dyllen's call). Each
  page's content width still needs designing (overview, writing/projects/talks lists, taxonomy,
  people, project and talk editors).
- **One right panel, two views:** a switch on its own row at the top, **Assistant | Site preview**
  (styled like the CMS's two-way toggles), then the four tabs **Shape · Write · Research · Review**
  on the row below. Switching views keeps the assistant's state. Rationale: drafted sections land
  in the editor, so the two are rarely needed together, and three columns would cramp everything
  again. The full-page "Preview ↗" in the action bar stays.
- The editor's current "Site preview" toggle becomes one **Hide panel** control; ✕ in the panel
  also closes it.
- Accepted tweaks: a **violet dot** on "Assistant" when a suggestion waits while the preview
  shows; a **keyboard shortcut** to flip views (e.g. ⌘\); the panel **reopens on the last view used**.
- Panel anatomy: content scrolls; a **reply box and the next action are pinned to the bottom**
  (e.g. "Write section 02 →", "Next: 03 … →", "Check whole draft", "Review again").
- **Suggestions in the editor:** a violet left rule and faint tint, labelled ("Suggested · section
  02"), with **Accept** / **Reject**. Accepting turns it into normal text.

## 9. Cost, models, and value

- **Budget:** up to **$200/month** (Dyllen). Cost is not the constraint; quality is. Use the
  strongest models and generous effort where it improves the result.
- **Estimate** (Claude, 2026-10-31, list prices Opus 5.5 $4 / $20 and Sonnet 5.5 $2 / $10 per
  million input/output tokens): ≈ 300K input + 65K output tokens per article (shaping, ~6 section
  drafts with redrafts, reviews, research) ≈ **$2–3 per article on Opus 5.5**, ~$10–20/month at
  his pace, plus web search's per-search fee. Prompt caching of the voice profile lowers it.
  Set a monthly **spend limit in the Anthropic Console** as a hard cap.
- **How Dyllen measures value:** **article reach, average read time, interactions with interactive
  elements (e.g. charts), re-posts, and social card interactions.** Today only Vercel unique visits
  exist. Collecting these is a **separate engagement-tracking project** (no comments, by design).
  Later, Review could learn from his own published pieces what actually performs.

## 10. My calls (Claude), open to change

- Suggestions and highlights are temporary ProseMirror **decorations** outside the stored
  Markdown: one extension, a whole paragraph or section at a time, dropped if the text underneath
  is edited.
- The voice profile is editable plain text; changes the assistant wants to make are proposed and
  need approval.
- Citations as inline links + Sources list (footnotes later).

## 11. Still open (for the design doc)

1. **Persistence:** where the idea, skeleton, per-section notes, research results, and voice profile
   are stored (likely new tables keyed to the post), and how they relate to revisions/history.
2. **The interview:** what each round asks, how many rounds, where it lives in the CMS.
3. **Find sources** detail: how offered facts are shown and inserted.
4. **Full-width layout per CMS page:** content widths for each non-editor page.
5. **Who can use the assistant:** all roles, or writer/editor only (`lib/cms/permissions.ts`).
6. **Mobile:** the editor uses tabs below `lg`; how the panel behaves there.
7. **Projects:** whether `ProjectEditor` gets the assistant too, or posts only for v1.
8. **Model per task:** e.g. Opus 5.5 for drafting and review; whether research uses web search
   plus web fetch; streaming for drafts.
9. **Engagement tracking:** separate project, scoped by section 9's list.

## Process

Same as charts (see AGENTS.md and `docs/superpowers/`): design doc → builder check → plan →
subagent-driven build in a git worktree → verify (unit, e2e, `pnpm build`, real browser) → merge
to `dev` → Vercel preview → production, asking Dyllen at each step.
