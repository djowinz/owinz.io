// The writing workflow end to end, as an editor: draft → autosave → terms →
// photo → publish (live without a rebuild) → edit → update live → restore →
// draft preview → Markdown export → category rename → unpublish.
// Steps share one post through ctx.state.writing and must run in order.
import fs from "node:fs";
import { assert, escapeRegExp, eventually, get, newPage, unique, waitForSaved } from "../lib.mjs";

const u = unique();
const title = `E2E harbor notes ${u}`;
const slug = `e2e-harbor-notes-${u}`;
const tagA = `e2e-tag-${u}`;
const tagB = `Field Notes ${u}`;
const V1 = `First live version ${u}.`;
const V2 = `Second live version ${u}.`;
const excerpt = "An end-to-end test post: drafted, published, edited, restored, previewed, exported, and unpublished.";

const body = (text) =>
  `## Morning\n\n![Fishing boats in the harbor at dawn](harbor.jpg "The harbor, 6am.")\n\n${text}\n\nA closing paragraph.\n`;

/** The editor page for the flow's post, opened once and reused. */
async function editor(ctx) {
  const s = (ctx.state.writing ??= {});
  if (!s.page || s.page.isClosed()) {
    s.context ??= await ctx.contextFor(ctx.sessions.editor);
    s.page = await newPage(s.context);
    if (s.id) await s.page.goto(`/admin/writing/${s.id}/`);
  }
  return s.page;
}

const bodyField = (page) => page.getByLabel("Post body (Markdown)");

async function markdownMode(page) {
  await page.getByRole("tab", { name: /^markdown$/i }).click();
  await bodyField(page).waitFor();
}

/** Clicks Publish / Update live, confirming warnings, and waits for the result. */
async function publish(page, button) {
  await page.getByRole("button", { name: button, exact: true }).click();
  const done = page.getByText("Published. The site is updated.");
  const anyway = page.getByRole("button", { name: "Publish anyway" });
  await Promise.race([done.waitFor(), anyway.waitFor()]);
  if (await anyway.isVisible()) {
    await anyway.click();
    await done.waitFor();
  }
}

const live = (ctx, path = `/writing/${slug}/`) => get(ctx.base, path);

export const flows = [
  {
    name: "create a post; autosave and the Saved indicator",
    async run(ctx) {
      // Before it exists, the URL is a real 404 (and that 404 is cached).
      assert((await live(ctx)).status === 404, "the future URL is a 404 before publishing");

      const page = await editor(ctx);
      await page.goto("/admin/writing/");
      await page.getByRole("button", { name: "New post" }).click();
      await page.waitForURL(/\/admin\/writing\/[0-9a-f-]{36}\/$/);
      ctx.state.writing.id = page.url().match(/([0-9a-f-]{36})\/$/)[1];

      await page.locator("#title").fill(title);
      await page.getByLabel("Excerpt").fill(excerpt);
      assert((await page.locator("#slug").inputValue()) === slug, "the URL follows the title");
      await eventually(async () => /unsaved|saving/i.test(await page.locator('[aria-live="polite"]').textContent()), {
        message: "the editor to notice unsaved changes",
      });
      await waitForSaved(page);

      const { rows } = await ctx.pg.query("select title, slug, excerpt, state from posts where id = $1", [ctx.state.writing.id]);
      assert(rows[0]?.title === title && rows[0].slug === slug && rows[0].excerpt === excerpt, "the draft was saved");
      assert(rows[0].state === "draft", "still a draft");
    },
  },
  {
    name: "pick a category and add new tags",
    async run(ctx) {
      const page = await editor(ctx);
      await page.locator("#category").selectOption({ label: "Engineering" });
      const tags = page.locator("#tags");
      await tags.fill(tagA);
      await tags.press("Enter");
      await page.getByRole("button", { name: `Remove ${tagA}` }).waitFor(); // the tag chip
      await tags.fill(`${tagB},`);
      await page.getByRole("button", { name: `Remove ${tagB}` }).waitFor(); // the tag chip
      await waitForSaved(page);

      const { rows } = await ctx.pg.query(
        `select t.name, t.kind from post_tags pt join terms t on t.id = pt.term_id where pt.post_id = $1 order by pt.position`,
        [ctx.state.writing.id],
      );
      assert(JSON.stringify(rows.map((r) => r.name)) === JSON.stringify([tagA, tagB]), `tags saved in order (got ${JSON.stringify(rows)})`);
      const { rows: cat } = await ctx.pg.query(
        "select t.name from posts p join terms t on t.id = p.category_id where p.id = $1",
        [ctx.state.writing.id],
      );
      assert(cat[0]?.name === "Engineering", "category saved");
    },
  },
  {
    name: "upload a photo through the tray",
    async run(ctx) {
      const page = await editor(ctx);
      const tray = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Photos/ }) });
      await tray.locator('input[type="file"]').setInputFiles(ctx.fixture("harbor.jpg"));
      await tray.getByText("harbor.jpg", { exact: true }).waitFor();
      await tray.getByRole("heading", { name: "Photos · 1" }).waitFor();
      const thumb = tray.locator("img").first();
      await eventually(() => thumb.evaluate((img) => img.complete && img.naturalWidth > 0), { message: "the thumbnail to load" });

      await markdownMode(page);
      await bodyField(page).click();
      await tray.getByRole("button", { name: "Insert", exact: true }).click();
      await eventually(async () => (await bodyField(page).inputValue()).includes("harbor.jpg"), {
        message: "Insert to add the photo to the text",
      });
      await bodyField(page).fill(body(V1));
      await waitForSaved(page);

      const { rows } = await ctx.pg.query("select name, width, height from assets where post_id = $1", [ctx.state.writing.id]);
      assert(rows.length === 1 && rows[0].name === "harbor.jpg" && rows[0].width > 0, "the photo is stored with its size");
    },
  },
  {
    name: "publish: the live article, category and tag pages update without a rebuild",
    async run(ctx) {
      const page = await editor(ctx);
      await publish(page, "Publish");

      const article = await eventually(async () => {
        const res = await live(ctx);
        return res.status === 200 && res.text.includes(V1) && res;
      }, { message: "the article to go live" });
      assert(article.text.includes(`<h1`) && article.text.includes(title), "the article shows its title");
      assert(article.text.includes(`/writing/category/engineering/`), "the article links its category");
      assert(article.text.includes(`/writing/tag/${tagA}/`), "the article links its tags");
      assert(/"@type":"BlogPosting"/.test(article.text), "the article has its JSON-LD");

      const photo = await fetch(new URL(`/writing/${slug}/harbor.jpg`, ctx.base));
      assert(photo.ok && photo.headers.get("content-type")?.startsWith("image/"), "the photo is served on the site");

      const category = await eventually(async () => (await live(ctx, "/writing/category/engineering/")).text.includes(title), {
        message: "the category page to list it",
      });
      assert(category, "category page lists it");
      const tag = await live(ctx, `/writing/tag/${tagA}/`);
      assert(tag.status === 200 && tag.text.includes(title), `the new tag's page lists it (got ${tag.status})`);
      assert((await live(ctx, "/writing/")).text.includes(title), "the archive lists it");
      assert((await live(ctx, "/sitemap.xml")).text.includes(`/writing/${slug}/`), "the sitemap lists it");
    },
  },
  {
    name: "edit after publishing: the live page is unchanged until Update live",
    async run(ctx) {
      const page = await editor(ctx);
      await bodyField(page).fill(body(V2));
      await waitForSaved(page);
      await page.getByText(/unpublished edits/i).first().waitFor();

      const before = await live(ctx);
      assert(before.text.includes(V1) && !before.text.includes(V2), "the live page still shows the published version");

      await publish(page, "Update live");
      await eventually(async () => {
        const res = await live(ctx);
        return res.text.includes(V2) && !res.text.includes(V1);
      }, { message: "the live page to show the update" });
    },
  },
  {
    name: "restore a version from history",
    async run(ctx) {
      const page = await editor(ctx);
      await page.getByRole("button", { name: "History", exact: true }).click();
      const dialog = page.locator("dialog[open]");
      const published = dialog.locator("section").filter({ hasText: "Published versions" });
      await published.getByRole("button", { name: "Restore" }).nth(1).waitFor();
      // Newest first: [0] is what's live (V2), [1] the first publish (V1).
      await published.getByRole("button", { name: "Restore" }).nth(1).click();
      await page.getByText("Version restored into the draft.").waitFor();
      assert((await bodyField(page).inputValue()).includes(V1), "the draft has the restored text");
      await page.getByText(/unpublished edits/i).first().waitFor();

      const { rows } = await ctx.pg.query("select body from posts where id = $1", [ctx.state.writing.id]);
      assert(rows[0].body.includes(V1), "the restore was saved to the draft");
      assert((await live(ctx)).text.includes(V2), "the live page is unchanged by a restore");
    },
  },
  {
    name: "the draft preview renders the draft exactly like the site",
    async run(ctx) {
      const page = await editor(ctx);
      const [preview] = await Promise.all([page.context().waitForEvent("page"), page.getByRole("button", { name: /Preview/ }).click()]);
      await preview.waitForURL(`**/admin/preview/writing/${ctx.state.writing.id}/`);
      await preview.getByText("Draft preview").waitFor();
      await preview.getByRole("heading", { level: 1, name: title }).waitFor();
      assert(await preview.getByText(V1).isVisible(), "the preview shows the draft's text");
      assert((await preview.getByText(V2).count()) === 0, "not the live text");
      const img = preview.locator(".prose figure img").first();
      assert((await img.getAttribute("src")).startsWith("/api/cms/photos/"), "draft photos come from the signed-in photo route");
      await eventually(() => img.evaluate((el) => el.complete && el.naturalWidth > 0), { message: "the draft photo to load" });
      assert(await preview.locator('meta[name="robots"][content*="noindex"]').count(), "the preview is noindex");
      // The same article markup as the live page (shared ArticleView).
      const liveHtml = (await live(ctx)).text;
      for (const marker of ["Filed under:", "/ END /", "All writing", `#${tagA}`.slice(1)]) {
        assert(liveHtml.includes(marker) && (await preview.content()).includes(marker), `both show “${marker}”`);
      }

      const response = await preview.request.get(preview.url());
      assert(/no-store|no-cache|private/.test(response.headers()["cache-control"] ?? ""), `never cached (cache-control: ${response.headers()["cache-control"]})`);

      if (ctx.screenshots) {
        for (const scheme of ["light", "dark"]) {
          await preview.emulateMedia({ colorScheme: scheme });
          await preview.setViewportSize({ width: 1280, height: 800 });
          await preview.screenshot({ path: `${ctx.screenshots}/preview-bar-${scheme}.png`, clip: { x: 0, y: 0, width: 1280, height: 360 } });
          await page.emulateMedia({ colorScheme: scheme });
          await page.setViewportSize({ width: 1280, height: 800 });
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: `${ctx.screenshots}/editor-toolbar-${scheme}.png`, clip: { x: 0, y: 0, width: 1280, height: 220 } });
        }
        await page.emulateMedia({ colorScheme: "light" });
      }
      await preview.close();

      // Signed out, the preview is off limits.
      const anon = await get(ctx.base, `/admin/preview/writing/${ctx.state.writing.id}/`);
      assert([302, 307].includes(anon.status), "signed-out visitors are redirected");
    },
  },
  {
    name: "export the draft as Markdown",
    async run(ctx) {
      const page = await editor(ctx);
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export .md" }).click()]);
      assert(download.suggestedFilename() === `${slug}.md`, `file name (got ${download.suggestedFilename()})`);
      const text = fs.readFileSync(await download.path(), "utf8");
      for (const expected of [
        `title: ${title}`,
        "category: Engineering",
        `  - ${tagA}`,
        `  - ${tagB}`,
        "status: published",
        "unpublishedChanges: true",
        "![Fishing boats in the harbor at dawn](harbor.jpg",
        V1,
      ]) {
        assert(text.includes(expected), `export contains ${JSON.stringify(expected)}:\n${text}`);
      }
      assert(/^---\n[\s\S]*?\n---\n/.test(text), "it starts with YAML frontmatter");
    },
  },
  {
    name: "renaming a category on the taxonomy page shows on live pages",
    async run(ctx) {
      const page = await editor(ctx);
      const rename = async (from, to) => {
        await page.goto("/admin/taxonomy/");
        // Mark the row: its input's value attribute changes as we type.
        await page
          .locator("li")
          .filter({ has: page.locator(`input[value="${from}"]`) })
          .first()
          .evaluate((li) => li.setAttribute("data-e2e-row", "rename"));
        const row = page.locator('li[data-e2e-row="rename"]');
        await row.getByLabel("Name").fill(to);
        await row.getByRole("button", { name: "Save" }).click();
        await eventually(async () => {
          const { rows } = await ctx.pg.query("select 1 from terms where kind = 'category' and name = $1", [to]);
          return rows.length === 1;
        }, { message: `the category to be renamed to ${to}` });
      };
      const renamed = `Engineering ${u}`;
      await rename("Engineering", renamed);
      await eventually(async () => (await live(ctx)).text.includes(renamed), { message: "the article to show the new name" });
      const category = await live(ctx, "/writing/category/engineering/");
      assert(category.text.includes(renamed), "the category page shows the new name");
      await rename(renamed, "Engineering");
      await eventually(async () => !(await live(ctx)).text.includes(renamed), { message: "the rename back to show" });
      await page.goto(`/admin/writing/${ctx.state.writing.id}/`);
    },
  },
  {
    name: "unpublish: gone from the archive, sitemap, and its URL",
    async run(ctx) {
      const page = await editor(ctx);
      await page.getByRole("button", { name: "Unpublish" }).click(); // confirm() is accepted
      await page.getByText("Unpublished. It's no longer on the site.").waitFor();
      await eventually(async () => !(await live(ctx, "/writing/")).text.includes(title), { message: "the archive to drop it" });
      await eventually(async () => !(await live(ctx, "/sitemap.xml")).text.includes(`/writing/${slug}/`), {
        message: "the sitemap to drop it",
      });
      await eventually(async () => (await live(ctx)).status === 404, { message: "its URL to 404" });
      assert(!new RegExp(escapeRegExp(title)).test((await live(ctx, "/writing/category/engineering/")).text), "the category page drops it");
      const { rows } = await ctx.pg.query("select state, body from posts where id = $1", [ctx.state.writing.id]);
      assert(rows[0].state === "draft" && rows[0].body.includes(V1), "the draft stays");
      await ctx.state.writing.context.close();
    },
  },
];
