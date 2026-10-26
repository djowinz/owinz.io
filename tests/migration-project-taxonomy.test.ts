import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

// Applies the real SQL migrations in order, with projects written in the old
// shape (free-text category and technologies) before the project taxonomy
// migration.
const DIR = path.join(__dirname, "..", "drizzle");
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

async function apply(db: PGlite, file: string) {
  for (const statement of fs.readFileSync(path.join(DIR, file), "utf8").split("--> statement-breakpoint")) {
    if (statement.trim()) await db.exec(statement);
  }
}

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const C = "33333333-3333-3333-3333-333333333333";

describe("0005/0006 project taxonomy migration", () => {
  it("turns free-text categories and technologies into projects terms, on projects and in revision snapshots", async () => {
    const db = new PGlite();
    for (const f of files.filter((f) => f < "0005")) await apply(db, f);

    await db.exec(`
      -- A writing term with a name a project also uses: collections stay separate.
      insert into terms (kind, collection, slug, name) values ('tag', 'writing', 'next-js', 'Next.js');
      insert into projects (id, slug, title, sort_order, category, technologies) values
        ('${A}', 'alpha', 'Alpha', 2, 'Personal Finance', '{React,D3.js,Node.js}'),
        ('${B}', 'beta', 'Beta', 1, ' Tooling ', '{Next.js,react,"Next.js",Prisma}'),
        ('${C}', 'gamma', 'Gamma', 3, null, '{}');
      insert into revisions (project_id, kind, snapshot, content_hash) values
        ('${A}', 'published', '{"title":"Alpha","category":"Finance","technologies":["Angular","React"],"sortOrder":2}', 'a'),
        ('${B}', 'autosave', '{"title":"Beta","category":"Tooling","technologies":["Next.js"],"sortOrder":1}', 'b'),
        ('${C}', 'published', '{"title":"Gamma","category":null,"technologies":[],"sortOrder":3}', 'c');
    `);

    for (const f of files.filter((f) => f >= "0005")) await apply(db, f);

    const terms = (await db.query<{ kind: string; collection: string; slug: string; name: string; sort_order: number }>(
      "select kind, collection, slug, name, sort_order from terms order by collection, kind, sort_order, slug",
    )).rows;
    expect(terms).toEqual([
      { kind: "tag", collection: "writing", slug: "next-js", name: "Next.js", sort_order: 0 },
      // Categories in the order of the first project that uses them; old-revision-only ones last.
      { kind: "category", collection: "projects", slug: "tooling", name: "Tooling", sort_order: 0 },
      { kind: "category", collection: "projects", slug: "personal-finance", name: "Personal Finance", sort_order: 1 },
      { kind: "category", collection: "projects", slug: "finance", name: "Finance", sort_order: 2 },
      { kind: "tag", collection: "projects", slug: "angular", name: "Angular", sort_order: 0 }, // only in an old revision
      { kind: "tag", collection: "projects", slug: "d3-js", name: "D3.js", sort_order: 0 },
      { kind: "tag", collection: "projects", slug: "next-js", name: "Next.js", sort_order: 0 },
      { kind: "tag", collection: "projects", slug: "node-js", name: "Node.js", sort_order: 0 },
      { kind: "tag", collection: "projects", slug: "prisma", name: "Prisma", sort_order: 0 },
      { kind: "tag", collection: "projects", slug: "react", name: "React", sort_order: 0 },
    ]);
    const id = async (kind: string, slug: string) =>
      (await db.query<{ id: string }>(
        "select id from terms where kind = $1 and collection = 'projects' and slug = $2",
        [kind, slug],
      )).rows[0].id;

    const projects = (await db.query<{ slug: string; category_id: string | null }>(
      "select slug, category_id from projects order by slug",
    )).rows;
    expect(projects).toEqual([
      { slug: "alpha", category_id: await id("category", "personal-finance") },
      { slug: "beta", category_id: await id("category", "tooling") }, // whitespace ignored
      { slug: "gamma", category_id: null },
    ]);

    const technologies = (await db.query<{ slug: string; tech: string; position: number }>(
      `select p.slug, t.slug as tech, pt.position from project_tags pt
       join projects p on p.id = pt.project_id join terms t on t.id = pt.term_id order by p.slug, pt.position`,
    )).rows;
    expect(technologies).toEqual([
      { slug: "alpha", tech: "react", position: 0 },
      { slug: "alpha", tech: "d3-js", position: 1 },
      { slug: "alpha", tech: "node-js", position: 2 },
      { slug: "beta", tech: "next-js", position: 0 }, // duplicates collapse, positions stay contiguous
      { slug: "beta", tech: "react", position: 1 },
      { slug: "beta", tech: "prisma", position: 2 },
    ]);

    const snapshots = (await db.query<{ snapshot: Record<string, unknown> }>(
      "select snapshot from revisions order by content_hash",
    )).rows.map((r) => r.snapshot);
    expect(snapshots[0]).toEqual({
      title: "Alpha",
      categoryId: await id("category", "finance"),
      technologyIds: [await id("tag", "angular"), await id("tag", "react")],
    });
    expect(snapshots[1]).toEqual({ title: "Beta", categoryId: await id("category", "tooling"), technologyIds: [await id("tag", "next-js")] });
    expect(snapshots[2]).toEqual({ title: "Gamma", categoryId: null, technologyIds: [] });

    const columns = (await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'projects'",
    )).rows.map((r) => r.column_name);
    expect(columns).toContain("category_id");
    expect(columns).not.toContain("category");
    expect(columns).not.toContain("technologies");
    await db.close();
  });
});
