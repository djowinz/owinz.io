// What each role can do. Contributors draft but can't publish or edit
// others' posts; only editors manage people.
import { assert, eventually, newPage, unique, waitForSaved } from "../lib.mjs";

/** Any post the contributor didn't create: the writing flow's, else a seeded one. */
async function someoneElsesPost(ctx) {
  if (ctx.state.writing?.id) return ctx.state.writing.id;
  const { rows } = await ctx.pg.query("select id from posts where created_by is distinct from $1 limit 1", [ctx.sessions.contributor.userId]);
  return rows[0].id;
}

async function expectNoPeople(page) {
  const nav = page.getByRole("navigation", { name: "CMS" });
  await nav.getByRole("link", { name: "Writing", exact: true }).waitFor();
  assert((await nav.getByRole("link", { name: "People", exact: true }).count()) === 0, "no People link");
  await page.goto("/admin/users/");
  await page.getByRole("heading", { level: 1, name: /Nothing/ }).waitFor();
  assert((await page.getByText("Who can sign in.").count()) === 0, "the People page doesn't render");
}

export const flows = [
  {
    name: "a contributor drafts but can't publish",
    async run(ctx) {
      const context = await ctx.contextFor(ctx.sessions.contributor);
      const page = await newPage(context);
      await page.goto("/admin/writing/");
      await page.getByRole("button", { name: "New post" }).click();
      await page.waitForURL(/\/admin\/writing\/[0-9a-f-]{36}\/$/);
      const id = page.url().match(/([0-9a-f-]{36})\/$/)[1];
      await page.locator("#title").fill(`Contributor draft ${unique()}`);
      await waitForSaved(page);
      await page.getByText("Your changes are saved as a draft. A writer or editor publishes it.").waitFor();
      for (const button of ["Publish", "Update live", "Unpublish", "Delete"]) {
        assert((await page.getByRole("button", { name: button, exact: true }).count()) === 0, `no ${button} button`);
      }
      // A contributor can add new tags (but not categories).
      const tag = `contrib-${unique()}`;
      await page.locator("#tags").fill(tag);
      await page.locator("#tags").press("Enter");
      await page.getByRole("button", { name: `Remove ${tag}` }).waitFor(); // the tag chip
      await waitForSaved(page);
      const { rows } = await ctx.pg.query("select state, created_by from posts where id = $1", [id]);
      assert(rows[0].state === "draft" && rows[0].created_by === ctx.sessions.contributor.userId, "saved as their draft");
      await context.close();
    },
  },
  {
    name: "a contributor can't edit someone else's post",
    async run(ctx) {
      const id = await someoneElsesPost(ctx);
      const { rows: before } = await ctx.pg.query("select updated_at from posts where id = $1", [id]);
      const context = await ctx.contextFor(ctx.sessions.contributor);
      const page = await newPage(context);
      await page.goto(`/admin/writing/${id}/`);
      await page.getByText("View only").waitFor();
      await page.getByText(/your role can.t edit it/).waitFor();
      assert(await page.locator("#title").isDisabled(), "the fields are disabled");
      assert((await page.getByRole("button", { name: "History", exact: true }).count()) === 1, "history is still readable");
      const { rows: after } = await ctx.pg.query("select updated_at from posts where id = $1", [id]);
      assert(before[0].updated_at.getTime() === after[0].updated_at.getTime(), "nothing was saved");
      await context.close();
    },
  },
  {
    name: "People is editor-only",
    async run(ctx) {
      for (const role of ["contributor", "writer"]) {
        const context = await ctx.contextFor(ctx.sessions[role]);
        const page = await newPage(context);
        await page.goto("/admin/");
        await expectNoPeople(page);
        await context.close();
      }
      const context = await ctx.contextFor(ctx.sessions.editor);
      const page = await newPage(context);
      await page.goto("/admin/users/");
      await page.getByText("Who can sign in.").waitFor();
      await eventually(async () => (await page.getByText("editor@e2e.test").count()) > 0, { message: "members listed" });
      await context.close();
    },
  },
];
