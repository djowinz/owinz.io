// `pnpm content:export` → `pnpm content:import <dir>` round trip: every post
// (drafts included), its category, tags, byline, dates, body, live state, and
// photos come back the same.
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import matter from "gray-matter";
import type { Db } from "../lib/db";
import { assets, posts, postTags } from "../lib/db/schema";
import { ensureTerm } from "../lib/cms/taxonomy";
import { exportAllPosts } from "../lib/cms/export";
import { exportPostsToDir } from "../lib/cms/export-files";
import { draftInput } from "../lib/cms/posts";
import { markdownEntries } from "../lib/content/files";
import { importWritingEntry } from "../lib/content/import";
import { publishPost } from "../lib/content/publishing";
import { termsById } from "../lib/content/terms";
import { testDb } from "./helpers/db";

const PHOTO = path.join(__dirname, "fixtures/content-photos/writing/photo-post/wide.jpg");

let source: { db: Db; close: () => Promise<void> };
let target: { db: Db; close: () => Promise<void> };
let dir: string;

async function addPost(db: Db, fields: Partial<typeof posts.$inferInsert> & { slug: string }, tags: string[] = [], category?: string) {
  const categoryId = category ? (await ensureTerm(db, { kind: "category", collection: "writing", name: category })).id : null;
  const [row] = await db
    .insert(posts)
    .values({ title: "A post title that is long enough", date: "2026-03-15", body: "Body.", categoryId, ...fields })
    .returning();
  for (const [position, name] of tags.entries()) {
    const term = await ensureTerm(db, { kind: "tag", collection: "writing", name });
    await db.insert(postTags).values({ postId: row.id, termId: term.id, position });
  }
  return row;
}

beforeAll(async () => {
  source = await testDb();
  target = await testDb();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "owinz-export-"));
  const db = source.db;

  const live = await addPost(
    db,
    {
      slug: "harbor-notes",
      title: "Notes from the harbor at dawn",
      excerpt: "What the fishing boats taught me about shipping software on a schedule, and when not to.",
      updated: "2026-04-02",
      byline: "Guest Author",
      body: '## Morning\n\n![Boats in the harbor](wide.jpg#right "Dawn, 6am.")\n\nText: "quoted", colons: and --- dashes.\n',
    },
    ["Debugging", "Process"],
    "Engineering",
  );
  await db.insert(assets).values({
    postId: live.id,
    name: "wide.jpg",
    blobUrl: "local://writing/harbor-notes/wide-abc.jpg",
    blobPathname: "writing/harbor-notes/wide-abc.jpg",
    contentType: "image/jpeg",
    width: 1600,
    height: 800,
    bytes: fs.statSync(PHOTO).size,
  });
  await publishPost(db, live.id);

  await addPost(db, { slug: "half-finished", title: "A draft that never shipped yet", body: "Still thinking." }, ["Process"]);

  const edited = await addPost(db, { slug: "edited-after-publishing", body: "Live text." }, [], "Personal");
  await publishPost(db, edited.id);
  await db.update(posts).set({ body: "Draft text, not live yet." }).where(eq(posts.id, edited.id));

  await exportPostsToDir(db, dir, async (pathname) =>
    pathname.endsWith("wide-abc.jpg") ? { stream: new Blob([new Uint8Array(fs.readFileSync(PHOTO))]).stream() } : null,
  );
  for (const entry of markdownEntries(path.join(dir, "writing"))) {
    await importWritingEntry(target.db, entry, {
      upload: async (pathname) => ({ url: `local://${pathname}`, pathname }),
    });
  }
});

afterAll(async () => {
  await source.close();
  await target.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function snapshot(db: Db) {
  const rows = await db.select().from(posts).orderBy(posts.slug);
  const byId = await termsById(db, "writing");
  return Promise.all(
    rows.map(async (row) => {
      const input = await draftInput(db, row);
      const photos = await db.select().from(assets).where(eq(assets.postId, row.id));
      return {
        ...input,
        body: input.body.trimEnd(), // the CMS ends bodies with a newline; files don't
        categoryId: input.categoryId ? byId.get(input.categoryId)?.name : null,
        tagIds: input.tagIds.map((id) => byId.get(id)?.name),
        state: row.state,
        photos: photos.map((p) => ({ name: p.name, width: p.width, height: p.height, contentType: p.contentType })),
      };
    }),
  );
}

describe("content export", () => {
  it("writes folder-style posts with frontmatter and photos", async () => {
    expect(fs.readdirSync(path.join(dir, "writing")).sort()).toEqual(["edited-after-publishing", "half-finished", "harbor-notes"]);
    expect(fs.readdirSync(path.join(dir, "writing/harbor-notes")).sort()).toEqual(["index.md", "wide.jpg"]);
    const { data, content } = matter(fs.readFileSync(path.join(dir, "writing/harbor-notes/index.md"), "utf8"));
    expect(data).toEqual({
      title: "Notes from the harbor at dawn",
      date: "2026-03-15",
      updated: "2026-04-02",
      excerpt: "What the fishing boats taught me about shipping software on a schedule, and when not to.",
      category: "Engineering",
      tags: ["Debugging", "Process"],
      byline: "Guest Author",
      status: "published",
    });
    expect(content.trim()).toBe('## Morning\n\n![Boats in the harbor](wide.jpg#right "Dawn, 6am.")\n\nText: "quoted", colons: and --- dashes.');
  });

  it("notes drafts and unpublished edits", async () => {
    const exported = await exportAllPosts(source.db);
    const meta = Object.fromEntries(exported.map((p) => [p.slug, matter(p.markdown).data]));
    expect(meta["half-finished"].status).toBe("draft");
    expect(meta["edited-after-publishing"]).toMatchObject({ status: "published", unpublishedChanges: true });
    expect(meta["harbor-notes"].unpublishedChanges).toBeUndefined();
  });

  it("passes the content check the importer runs first", () => {
    const out = execFileSync(process.execPath, [path.join(__dirname, "../scripts/validate-content.mjs"), dir], { encoding: "utf8" });
    expect(out).toMatch(/ 0 error\(s\)/);
  });

  it("imports back to the same posts", async () => {
    const before = await snapshot(source.db);
    const after = await snapshot(target.db);
    expect(after).toEqual(before);
    expect(after.map((p) => [p.slug, p.state])).toEqual([
      ["edited-after-publishing", "published"],
      ["half-finished", "draft"],
      ["harbor-notes", "published"],
    ]);
  });
});
