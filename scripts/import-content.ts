// One-time import of content/ (Markdown files and photos) into Neon and
// Vercel Blob. Safe to re-run: rows are matched by slug and updated, photos
// re-uploaded, and publishing skips a new version when nothing changed.
//
//   pnpm content:import --dry-run    show what would happen
//   pnpm content:import              import (runs the content check first)
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
  writingSource,
} from "../lib/content/files";
import { publishPost, publishProject } from "../lib/content/publishing";
import { getDb, type Db } from "../lib/db";
import { assets, posts, postTags, projects, talks } from "../lib/db/schema";
import { ensureTerm } from "../lib/cms/taxonomy";
import { prepareImage } from "../lib/images";

const dryRun = process.argv.includes("--dry-run");
const log = (...args: unknown[]) => console.log(dryRun ? "[dry run]" : "", ...args);

// Same rules as before the CMS: refuse to import content that wouldn't have built.
execFileSync(process.execPath, [path.join(__dirname, "validate-content.mjs")], { stdio: "inherit" });

// Connected in main() so a dry run works without database credentials.
let db: Db;

async function importWriting() {
  for (const entry of markdownEntries(path.join(CONTENT_DIR, "writing"))) {
    const source = writingSource(entry);
    const { images } = await parseWriting(entry);
    log(`writing/${source.slug}`, images.length ? `(${images.length} photos)` : "");
    if (dryRun) continue;

    // Frontmatter category and tags become (or reuse) writing terms.
    const category = source.category
      ? await ensureTerm(db, { kind: "category", collection: "writing", name: source.category.name })
      : null;
    const tagIds: string[] = [];
    for (const tag of source.tags ?? []) {
      const term = await ensureTerm(db, { kind: "tag", collection: "writing", name: tag.name });
      if (!tagIds.includes(term.id)) tagIds.push(term.id);
    }

    const fields = {
      slug: source.slug,
      title: source.title,
      excerpt: source.excerpt ?? "",
      categoryId: category?.id ?? null,
      date: source.date,
      updated: source.updated ?? null,
      byline: source.byline ?? null,
      body: source.body.trim(),
    };
    const [row] = await db
      .insert(posts)
      .values(fields)
      .onConflictDoUpdate({ target: posts.slug, set: fields })
      .returning();
    await db.delete(postTags).where(eq(postTags.postId, row.id));
    if (tagIds.length) {
      await db.insert(postTags).values(tagIds.map((termId, position) => ({ postId: row.id, termId, position })));
    }

    for (const name of images) {
      const photo = await prepareImage(path.join(entry.folder!, name), name);
      const blob = await uploadBlob(`writing/${source.slug}/${name}`, photo.data, photo.contentType);
      const asset = {
        postId: row.id,
        name,
        blobUrl: blob.url,
        blobPathname: blob.pathname,
        contentType: photo.contentType,
        width: photo.width ?? null,
        height: photo.height ?? null,
        bytes: photo.data.length,
      };
      await db
        .insert(assets)
        .values(asset)
        .onConflictDoUpdate({ target: [assets.postId, assets.name], set: asset });
      log(`  ↳ ${name} → ${blob.pathname} (${Math.round(photo.data.length / 1024)} KB)`);
    }
    await publishPost(db, row.id);
  }
}

async function importProjects() {
  for (const entry of markdownEntries(path.join(CONTENT_DIR, "projects"))) {
    const { status, order, ...source } = projectSource(entry);
    log(`projects/${source.slug}`);
    if (dryRun) continue;

    const fields = {
      ...source,
      description: source.description ?? "",
      purpose: source.purpose ?? "",
      challenge: source.challenge ?? "",
      technologies: source.technologies ?? [],
      projectStatus: status ?? null,
      sortOrder: order ?? 0,
      body: source.body.trim(),
    };
    const [row] = await db
      .insert(projects)
      .values(fields)
      .onConflictDoUpdate({ target: projects.slug, set: fields })
      .returning();
    await publishProject(db, row.id);
  }
}

async function importTalks() {
  for (const entry of markdownEntries(path.join(CONTENT_DIR, "talks"))) {
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
