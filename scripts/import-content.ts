// One-time import of content/ (Markdown files and photos) into Neon and
// Vercel Blob. Safe to re-run: rows are matched by slug and updated, photos
// re-uploaded, and publishing skips a new version when nothing changed.
//
//   pnpm content:import --dry-run    show what would happen
//   pnpm content:import              import (runs the content check first)
//   pnpm content:import <dir>        import another content folder, e.g. one
//                                    written by `pnpm content:export`
import { execFileSync } from "child_process";
import path from "path";
import { eq } from "drizzle-orm";
import { uploadBlob } from "../lib/blob";
import {
  CONTENT_DIR,
  markdownEntries,
  parseWriting,
  projectSource,
  talkSource,
} from "../lib/content/files";
import { importWritingEntry } from "../lib/content/import";
import { publishProject } from "../lib/content/publishing";
import { getDb, type Db } from "../lib/db";
import { posts, projects, projectTags, talks } from "../lib/db/schema";
import { ensureTerm } from "../lib/cms/taxonomy";

const dryRun = process.argv.includes("--dry-run");
const dirArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const CONTENT_ROOT = dirArg ? path.resolve(dirArg) : CONTENT_DIR;
const log = (...args: unknown[]) => console.log(dryRun ? "[dry run]" : "", ...args);

// Same rules as before the CMS: refuse to import content that wouldn't have built.
execFileSync(process.execPath, [path.join(__dirname, "validate-content.mjs"), CONTENT_ROOT], { stdio: "inherit" });

// Connected in main() so a dry run works without database credentials.
let db: Db;

async function importWriting() {
  for (const entry of markdownEntries(path.join(CONTENT_ROOT, "writing"))) {
    const { images } = await parseWriting(entry);
    log(`writing/${entry.slug}`, images.length ? `(${images.length} photos)` : "");
    if (dryRun) continue;
    await importWritingEntry(db, entry, { upload: uploadBlob, log });
  }
}

async function importProjects() {
  for (const entry of markdownEntries(path.join(CONTENT_ROOT, "projects"))) {
    const { status, order, category: categoryRef, technologies, ...source } = projectSource(entry);
    log(`projects/${source.slug}`);
    if (dryRun) continue;

    // Frontmatter category and technologies become (or reuse) projects terms.
    const category = categoryRef
      ? await ensureTerm(db, { kind: "category", collection: "projects", name: categoryRef.name })
      : null;
    const technologyIds: string[] = [];
    for (const tech of technologies ?? []) {
      const term = await ensureTerm(db, { kind: "tag", collection: "projects", name: tech.name });
      if (!technologyIds.includes(term.id)) technologyIds.push(term.id);
    }

    const fields = {
      ...source,
      description: source.description ?? "",
      purpose: source.purpose ?? "",
      challenge: source.challenge ?? "",
      categoryId: category?.id ?? null,
      projectStatus: status ?? null,
      sortOrder: order ?? 0,
      body: source.body.trim(),
    };
    const [row] = await db
      .insert(projects)
      .values(fields)
      .onConflictDoUpdate({ target: projects.slug, set: fields })
      .returning();
    await db.delete(projectTags).where(eq(projectTags.projectId, row.id));
    if (technologyIds.length) {
      await db
        .insert(projectTags)
        .values(technologyIds.map((termId, position) => ({ projectId: row.id, termId, position })));
    }
    await publishProject(db, row.id);
  }
}

async function importTalks() {
  for (const entry of markdownEntries(path.join(CONTENT_ROOT, "talks"))) {
    const { status, upcoming, ...source } = talkSource(entry);
    log(`talks/${source.slug}`);
    if (dryRun) continue;

    const fields = { ...source, talkStatus: status ?? null, upcoming: upcoming ?? null, state: "published" as const };
    await db.insert(talks).values(fields).onConflictDoUpdate({ target: talks.slug, set: fields });
  }
}

async function main() {
  if (!dryRun) db = getDb();
  await importWriting();
  await importProjects();
  await importTalks();

  if (!dryRun) {
    const count = async (table: typeof posts | typeof projects | typeof talks) =>
      (await db.select({ id: table.id }).from(table).where(eq(table.state, "published"))).length;
    console.log(
      `\nimported: ${await count(posts)} posts, ${await count(projects)} projects, ${await count(talks)} talks live`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
