// First-build seed. A brand-new database (no content, categories, tags, or
// CMS accounts) gets the Markdown in content/ imported — creating its
// categories and tags along the way — and OWINZ_IO_FIRST_EDITOR (if set)
// invited as an editor, so a fresh production or preview database starts
// with the site's content and someone who can sign in. Anything already in
// the database, even a single account, means it's been set up: nothing runs.
//
//   pnpm db:seed    (also runs in `pnpm build`, after migrations)
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { count } from "drizzle-orm";
import { getDb } from "../lib/db";
import { invites, posts, projects, talks, terms, users } from "../lib/db/schema";
import { normalizeEmail } from "../lib/cms/users";

async function rows(table: typeof posts | typeof projects | typeof talks | typeof terms | typeof users | typeof invites) {
  const [{ n }] = await getDb().select({ n: count() }).from(table);
  return n;
}

async function main() {
  const db = getDb();
  const counts = await Promise.all([rows(posts), rows(projects), rows(talks), rows(terms), rows(users), rows(invites)]);
  if (counts.some((n) => n > 0)) {
    console.log("db:seed — database already set up, nothing to do");
    process.exit(0);
  }

  const content = path.join(process.cwd(), "content");
  if (fs.existsSync(content)) {
    console.log("db:seed — fresh database: importing content/");
    execFileSync(process.execPath, ["--import", "tsx", path.join(__dirname, "import-content.ts")], { stdio: "inherit" });
  }

  const firstEditor = process.env.OWINZ_IO_FIRST_EDITOR;
  if (firstEditor) {
    await db.insert(invites).values({ email: normalizeEmail(firstEditor), role: "editor" }).onConflictDoNothing();
    console.log(`db:seed — invited ${normalizeEmail(firstEditor)} as the first editor`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
