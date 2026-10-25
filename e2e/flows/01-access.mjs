// Signing in and out: signed-out visitors are bounced from the CMS, and a
// signed-in user lands on the overview.
import { assert, get, newPage } from "../lib.mjs";

export const flows = [
  {
    name: "signed-out visitors are sent to sign-in",
    async run({ base, contextFor }) {
      for (const path of ["/admin/", "/admin/writing/", "/admin/users/", "/admin/preview/writing/00000000-0000-0000-0000-000000000000/"]) {
        const res = await get(base, path);
        assert(res.status === 307 || res.status === 302, `${path} redirects (got ${res.status})`);
        assert(new URL(res.headers.get("location"), base).pathname === "/admin/login/", `${path} → /admin/login/`);
      }
      const md = await get(base, "/api/cms/posts/00000000-0000-0000-0000-000000000000/markdown/");
      assert(md.status === 404, `Markdown export is hidden from signed-out visitors (got ${md.status})`);

      const context = await contextFor(null);
      const page = await newPage(context);
      await page.goto("/admin/writing/");
      await page.waitForURL("**/admin/login/");
      await page.getByRole("heading", { name: /sign in/i }).waitFor();
      await context.close();
    },
  },
  {
    name: "signing in redirects to the CMS",
    async run({ contextFor, sessions }) {
      const context = await contextFor(sessions.editor);
      const page = await newPage(context);
      // Already signed in: the sign-in page sends you on.
      await page.goto("/admin/login/");
      await page.waitForURL((url) => url.pathname === "/admin/");
      await page.getByRole("heading", { name: /Hello, Edie/ }).waitFor();
      const nav = page.getByRole("navigation", { name: "CMS" });
      for (const item of ["Overview", "Writing", "Categories & tags", "People"]) {
        await nav.getByRole("link", { name: item, exact: true }).waitFor();
      }
      await context.close();
    },
  },
  {
    name: "a forged session cookie gets nothing",
    async run({ base, contextFor }) {
      // proxy.ts only checks that a cookie exists; the page itself must refuse it.
      const res = await get(base, "/admin/writing/", { headers: { cookie: "better-auth.session_token=forged.token" } });
      assert(!res.text.includes("New post"), "no CMS content in the HTML");
      const context = await contextFor({ cookie: { name: "better-auth.session_token", value: "forged.token" } });
      const page = await newPage(context);
      await page.goto("/admin/writing/");
      await page.waitForURL("**/admin/login/");
      await context.close();
    },
  },
];
