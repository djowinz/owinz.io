import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

// Applies the real SQL migrations in order, with content written before
// first_published_at existed, including a post that was published and then
// unpublished (which cleared published_revision_id).
const DIR = path.join(__dirname, "..", "drizzle");
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

async function apply(db: PGlite, file: string) {
  for (const statement of fs.readFileSync(path.join(DIR, file), "utf8").split("--> statement-breakpoint")) {
    if (statement.trim()) await db.exec(statement);
  }
}

const LIVE = "11111111-1111-1111-1111-111111111111";
const UNPUBLISHED = "22222222-2222-2222-2222-222222222222";
const DRAFT = "33333333-3333-3333-3333-333333333333";
const PROJECT = "44444444-4444-4444-4444-444444444444";

describe("0007 first_published_at", () => {
  it("dates posts and projects from their earliest published revision, and live talks from their last change", async () => {
    const db = new PGlite();
    for (const f of files.filter((f) => f < "0007")) await apply(db, f);

    await db.exec(`
      insert into posts (id, slug, title, date) values
        ('${LIVE}', 'live', 'Live', '2026-01-01'),
        ('${UNPUBLISHED}', 'unpublished', 'Unpublished', '2026-01-02'),
        ('${DRAFT}', 'draft', 'Draft', '2026-01-03');
      insert into projects (id, slug, title) values ('${PROJECT}', 'project', 'Project');
      insert into revisions (post_id, project_id, kind, snapshot, content_hash, created_at) values
        ('${LIVE}', null, 'published', '{}', 'a', '2026-02-01T00:00:00Z'),
        ('${LIVE}', null, 'published', '{}', 'b', '2026-03-01T00:00:00Z'),
        ('${UNPUBLISHED}', null, 'published', '{}', 'c', '2026-02-15T00:00:00Z'),
        ('${DRAFT}', null, 'autosave', '{}', 'd', '2026-02-20T00:00:00Z'),
        (null, '${PROJECT}', 'published', '{}', 'e', '2026-04-01T00:00:00Z');
      update posts set state = 'published', published_slug = slug,
        published_revision_id = (select id from revisions where content_hash = 'b') where id = '${LIVE}';
      insert into talks (slug, title, date, state, updated_at) values
        ('on-stage', 'On stage', '2026-05-01', 'published', '2026-04-20T00:00:00Z'),
        ('idea', 'Idea', '2026-06-01', 'draft', '2026-04-21T00:00:00Z');
    `);

    for (const f of files.filter((f) => f >= "0007")) await apply(db, f);

    const iso = (rows: { slug: string; first_published_at: Date | null }[]) =>
      Object.fromEntries(rows.map((r) => [r.slug, r.first_published_at?.toISOString() ?? null]));
    const q = (table: string) =>
      db.query<{ slug: string; first_published_at: Date | null }>(`select slug, first_published_at from ${table}`);

    expect(iso((await q("posts")).rows)).toEqual({
      live: "2026-02-01T00:00:00.000Z", // the earliest, not the live revision
      unpublished: "2026-02-15T00:00:00.000Z", // still counts as published once
      draft: null,
    });
    expect(iso((await q("projects")).rows)).toEqual({ project: "2026-04-01T00:00:00.000Z" });
    expect(iso((await q("talks")).rows)).toEqual({ "on-stage": "2026-04-20T00:00:00.000Z", idea: null });
    await db.close();
  });
});
