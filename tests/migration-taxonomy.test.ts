import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

// Applies the real SQL migrations in order, with data written in the old
// shape (free-text category and tags) before the taxonomy migration.
const DIR = path.join(__dirname, "..", "drizzle");
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

async function apply(db: PGlite, file: string) {
  for (const statement of fs.readFileSync(path.join(DIR, file), "utf8").split("--> statement-breakpoint")) {
    if (statement.trim()) await db.exec(statement);
  }
}

describe("0003/0004 taxonomy migration", () => {
  it("turns free-text categories and tags into terms, on posts and in revision snapshots", async () => {
    const db = new PGlite();
    for (const f of files.filter((f) => f < "0003")) await apply(db, f);

    await db.exec(`
      insert into posts (id, slug, title, date, category, tags) values
        ('11111111-1111-1111-1111-111111111111', 'one', 'One', '2026-01-01', 'Engineering', '{debugging,process}'),
        ('22222222-2222-2222-2222-222222222222', 'two', 'Two', '2026-01-02', '  Engineering ', '{Process,process,"Next.js"}'),
        ('33333333-3333-3333-3333-333333333333', 'three', 'Three', '2026-01-03', null, '{}');
      insert into revisions (post_id, kind, snapshot, content_hash) values
        ('11111111-1111-1111-1111-111111111111', 'published', '{"title":"One","category":"Philosophy","tags":["old-tag","debugging"]}', 'x'),
        ('22222222-2222-2222-2222-222222222222', 'autosave', '{"title":"Two","category":"Engineering","tags":["process"]}', 'y'),
        ('33333333-3333-3333-3333-333333333333', 'autosave', '{"title":"Three","category":null,"tags":[]}', 'z');
    `);

    for (const f of files.filter((f) => f >= "0003")) await apply(db, f);

    const terms = (await db.query<{ kind: string; slug: string; name: string }>(
      "select kind, slug, name from terms order by kind, slug",
    )).rows;
    expect(terms).toEqual([
      { kind: "category", slug: "engineering", name: "Engineering" },
      { kind: "category", slug: "philosophy", name: "Philosophy" }, // only in an old revision
      { kind: "tag", slug: "debugging", name: "debugging" },
      { kind: "tag", slug: "next-js", name: "Next.js" },
      { kind: "tag", slug: "old-tag", name: "old-tag" },
      { kind: "tag", slug: "process", name: "Process" },
    ]);
    const id = (kind: string, slug: string) => terms.length && db.query<{ id: string }>(
      "select id from terms where kind = $1 and slug = $2", [kind, slug],
    ).then((r) => r.rows[0].id);

    const posts = (await db.query<{ slug: string; category_id: string | null }>(
      "select slug, category_id from posts order by slug",
    )).rows;
    const engineering = await id("category", "engineering");
    expect(posts).toEqual([
      { slug: "one", category_id: engineering },
      { slug: "three", category_id: null },
      { slug: "two", category_id: engineering }, // whitespace ignored
    ]);

    const tags = (await db.query<{ slug: string; tag: string; position: number }>(
      `select p.slug, t.slug as tag, pt.position from post_tags pt
       join posts p on p.id = pt.post_id join terms t on t.id = pt.term_id order by p.slug, pt.position`,
    )).rows;
    expect(tags).toEqual([
      { slug: "one", tag: "debugging", position: 0 },
      { slug: "one", tag: "process", position: 1 },
      { slug: "two", tag: "process", position: 0 }, // "Process" and "process" are one tag
      { slug: "two", tag: "next-js", position: 2 },
    ]);

    const snapshots = (await db.query<{ snapshot: Record<string, unknown> }>(
      "select snapshot from revisions order by content_hash",
    )).rows.map((r) => r.snapshot);
    expect(snapshots[0]).toEqual({
      title: "One",
      categoryId: await id("category", "philosophy"),
      tagIds: [await id("tag", "old-tag"), await id("tag", "debugging")],
    });
    expect(snapshots[1]).toEqual({ title: "Two", categoryId: engineering, tagIds: [await id("tag", "process")] });
    expect(snapshots[2]).toEqual({ title: "Three", categoryId: null, tagIds: [] });

    const columns = (await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'posts'",
    )).rows.map((r) => r.column_name);
    expect(columns).not.toContain("category");
    expect(columns).not.toContain("tags");
    await db.close();
  });
});
