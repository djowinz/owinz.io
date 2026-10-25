// Helpers shared by the end-to-end flows (e2e/flows/*.mjs). See e2e/run.mjs.
import { createHmac, randomBytes, randomUUID } from "node:crypto";

/** Polls until `fn` returns a truthy value (or stops throwing); no fixed sleeps. */
export async function eventually(fn, { timeout = 15_000, interval = 150, message = "condition" } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  for (;;) {
    try {
      const value = await fn();
      if (value) return value;
      last = new Error(`returned ${JSON.stringify(value)}`);
    } catch (err) {
      last = err;
    }
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${message}: ${last?.message ?? last}`);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

export function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

/** A short unique suffix, so flows never collide with seeded content or each other. */
export const unique = () => randomBytes(3).toString("hex");

/**
 * Better Auth's session cookie: the token plus an HMAC-SHA256 signature
 * with BETTER_AUTH_SECRET (better-call's signed cookie format).
 */
export function sessionCookieValue(token, secret) {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

/** Inserts a CMS user with a role and a live session; returns what a browser context needs. */
export async function mintSession(pg, secret, { role, name, email }) {
  const userId = `e2e-${role}-${unique()}`;
  const token = randomBytes(24).toString("base64url");
  await pg.query(
    "insert into users (id, name, email, email_verified, role) values ($1, $2, $3, true, $4)",
    [userId, name, email, role],
  );
  await pg.query("insert into sessions (id, token, expires_at, user_id) values ($1, $2, now() + interval '1 day', $3)", [
    randomUUID(),
    token,
    userId,
  ]);
  return { userId, role, name, cookie: { name: "better-auth.session_token", value: sessionCookieValue(token, secret) } };
}

/** A browser context signed in as `session` (or signed out when null). */
export async function contextFor(browser, base, session, options = {}) {
  const context = await browser.newContext({ baseURL: base, acceptDownloads: true, ...options });
  if (session) {
    await context.addCookies([
      { ...session.cookie, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax", secure: false },
    ]);
  }
  // window.confirm() for Unpublish/Delete: accept.
  context.on("page", (page) => page.on("dialog", (dialog) => dialog.accept()));
  return context;
}

export async function newPage(context) {
  const page = await context.newPage();
  page.on("dialog", (dialog) => dialog.accept().catch(() => {}));
  return page;
}

/** GET from the site as a signed-out visitor (no redirects followed). */
export async function get(base, pathname, init = {}) {
  const res = await fetch(new URL(pathname, base), { redirect: "manual", ...init });
  return { status: res.status, headers: res.headers, text: await res.text() };
}

/** The editor's save-status label once a save completed ("Saved 14:03"). */
export async function waitForSaved(page) {
  const status = page.locator('[aria-live="polite"]');
  await eventually(async () => /^Saved \d\d:\d\d$/.test((await status.textContent())?.trim() ?? ""), {
    message: "the editor to show “Saved HH:mm”",
  });
}

/** Text of the editor's live-state label: "Draft", "Live", "Live · unpublished edits". */
export async function liveLabel(page) {
  return (await page.locator("div.sticky span").first().textContent())?.trim();
}

export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
