// Charts end to end, as an editor: toolbar Chart → paste spreadsheet data →
// settings → Insert chart → the chart in the editor and the site preview →
// publish → the live page's figure and data table → Edit → Save.
// Steps share one post through ctx.state.charts and must run in order.
import { assert, eventually, get, newPage, unique, waitForSaved } from "../lib.mjs";

const u = unique();
const title = `E2E chart notes ${u}`;
const slug = `e2e-chart-notes-${u}`;
const chartTitle = "Faster to ship, slower to fix";
const newChartTitle = `Lead time and MTTR ${u}`;

/** 26 weekly rows from 2026-04-27, tab-separated as a spreadsheet copies them. */
function weeklyData() {
  const lines = ["week\tLead time (days)\tMTTR (hours)"];
  const start = Date.UTC(2026, 3, 27);
  for (let i = 0; i < 26; i++) {
    const week = new Date(start + i * 7 * 86_400_000).toISOString().slice(0, 10);
    const lead = (4.4 - i * 0.1).toFixed(1);
    const mttr = (2.8 + i * 0.12).toFixed(1);
    lines.push(`${week}\t${lead}\t${mttr}`);
  }
  return lines.join("\n");
}

/** The editor page for the flow's post, opened once and reused. */
async function editor(ctx) {
  const s = (ctx.state.charts ??= {});
  if (!s.page || s.page.isClosed()) {
    s.context ??= await ctx.contextFor(ctx.sessions.editor);
    s.page = await newPage(s.context);
    if (s.id) await s.page.goto(`/admin/writing/${s.id}/`);
  }
  return s.page;
}

const chartDialog = (page) => page.getByRole("dialog");

/** Clicks Publish, confirming warnings, and waits for the result. */
async function publish(page) {
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const done = page.getByText("Published. The site is updated.");
  const anyway = page.getByRole("button", { name: "Publish anyway" });
  await Promise.race([done.waitFor(), anyway.waitFor()]);
  if (await anyway.isVisible()) {
    await anyway.click();
    await done.waitFor();
  }
}

const live = (ctx) => get(ctx.base, `/writing/${slug}/`);

export const flows = [
  {
    name: "add a chart from pasted spreadsheet data",
    async run(ctx) {
      const page = await editor(ctx);
      await page.goto("/admin/writing/");
      await page.getByRole("button", { name: "New post" }).click();
      await page.waitForURL(/\/admin\/writing\/[0-9a-f-]{36}\/$/);
      ctx.state.charts.id = page.url().match(/([0-9a-f-]{36})\/$/)[1];
      await page.locator("#title").fill(title);
      await page.getByLabel("Excerpt").fill("An end-to-end test post with a chart.");
      await page.getByRole("button", { name: "Site preview" }).click();

      await page.getByRole("button", { name: "Chart", exact: true }).click();
      const dialog = chartDialog(page);
      await dialog.getByRole("heading", { name: "Add a chart" }).waitFor();
      await dialog.getByLabel("Paste your data").fill(weeklyData());

      const summary = dialog.getByRole("status");
      await eventually(async () => {
        const text = await summary.textContent();
        return text.includes("26 rows") && text.includes("dates");
      }, { message: "the found-summary to describe the data" });
      const line = dialog.getByRole("button", { name: "Line", exact: true });
      assert((await line.getAttribute("aria-pressed")) === "true", "Line is suggested for dates");

      await dialog.getByRole("button", { name: "Stacked", exact: true }).click();
      await dialog.getByLabel("Title", { exact: true }).fill(chartTitle);
      await dialog.getByRole("button", { name: "+ Add marker" }).click();
      await dialog.getByLabel("Marker x").fill("2026-06-08");
      await dialog.getByLabel("Marker label").fill("AI rollout");
      await dialog.locator("figure.chart svg").first().waitFor(); // the live preview

      await dialog.getByRole("button", { name: "Insert chart", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });

      await page.locator("[data-chart-block] svg").first().waitFor();
      await page.locator("figure.chart[data-hydrated] svg").first().waitFor(); // the Site preview column

      if (ctx.screenshots) {
        await page.getByRole("button", { name: "Chart", exact: true }).click();
        await chartDialog(page).getByLabel("Paste your data").fill(weeklyData());
        await chartDialog(page).locator("figure.chart svg").first().waitFor();
        for (const scheme of ["light", "dark"]) {
          await page.emulateMedia({ colorScheme: scheme });
          await page.setViewportSize({ width: 1280, height: 800 });
          await page.screenshot({ path: `${ctx.screenshots}/chart-dialog-${scheme}.png` });
        }
        await page.emulateMedia({ colorScheme: "light" });
        await page.keyboard.press("Escape");
        await chartDialog(page).waitFor({ state: "hidden" });
      }

      await waitForSaved(page);
      const { rows } = await ctx.pg.query("select body from posts where id = $1", [ctx.state.charts.id]);
      const body = rows[0]?.body ?? "";
      for (const expected of ["```chart\ntype: line\nlayout: stacked\n", `title: ${chartTitle}`, "  - x: 2026-06-08\n    label: AI rollout", "week,Lead time (days),MTTR (hours)\n2026-04-27,4.4,2.8"]) {
        assert(body.includes(expected), `the body contains ${JSON.stringify(expected)}:\n${body}`);
      }
    },
  },
  {
    name: "publish: the live page has the chart figure and its data table",
    async run(ctx) {
      const page = await editor(ctx);
      await publish(page);

      const article = await eventually(async () => {
        const res = await live(ctx);
        return res.status === 200 && res;
      }, { message: "the article to go live" });
      assert(article.text.includes('figure class="chart"'), "the live HTML has the chart figure");
      assert(article.text.includes('table class="chart-data"'), "the live HTML has the data table");

      const visitor = await newPage(await ctx.contextFor(null));
      await visitor.goto(`/writing/${slug}/`);
      await visitor.locator("figure.chart svg").first().waitFor();
      await visitor.context().close();
    },
  },
  {
    name: "edit the chart: Save replaces the block",
    async run(ctx) {
      const page = await editor(ctx);
      await page.locator("[data-chart-block]").getByRole("button", { name: "Edit" }).click();
      const dialog = chartDialog(page);
      await dialog.getByRole("heading", { name: "Edit chart" }).waitFor();
      const titleField = dialog.getByLabel("Title", { exact: true });
      assert((await titleField.inputValue()) === chartTitle, "the dialog is prefilled");
      await titleField.fill(newChartTitle);
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      // The block changed and the editor noticed, so the "Saved" we wait for is the new save.
      await page.locator("[data-chart-block] .chart-title", { hasText: newChartTitle }).waitFor();
      await eventually(async () => /unsaved|saving/i.test(await page.locator('[aria-live="polite"]').textContent()), {
        message: "the editor to notice the edited chart",
      });
      await waitForSaved(page);

      await page.reload();
      await page.getByRole("tab", { name: /^markdown$/i }).click();
      const markdown = await page.getByLabel("Post body (Markdown)").inputValue();
      assert(markdown.includes(`title: ${newChartTitle}`), `Markdown mode shows the new title:\n${markdown}`);
      assert(!markdown.includes(chartTitle), "the old title is gone");
      assert((markdown.match(/```chart/g) ?? []).length === 1, "Save replaced the block instead of adding one");
      await ctx.state.charts.context.close();
    },
  },
];
