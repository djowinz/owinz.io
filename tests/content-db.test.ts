import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../lib/db";
import { assets, posts, projects, REVISION_LIMITS, talks, users } from "../lib/db/schema";
import {
  publishedPost,
  publishedPostAsset,
  publishedPosts,
  publishedProjects,
  publishedTalks,
} from "../lib/content/db";
import { publishPost, publishProject, unpublishPost } from "../lib/content/publishing";
import { listRevisions, saveRevision, snapshotHash } from "../lib/content/revisions";
import { testDb } from "./helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await testDb());
});
afterAll(() => close());
beforeEach(async () => {
  await db.execute(sql`truncate users, posts, projects, talks, assets, revisions, terms cascade`);
  await db.insert(users).values({ id: "user-1", name: "Ghost Writer", email: "ghost@example.com", role: "writer" });
});

const draft = (overrides: Partial<typeof posts.$inferInsert> = {}) => ({
  slug: "hello",
  title: "Hello",
  date: "2026-03-15",
  body: "First paragraph of the post.",
  ...overrides,
});

async function livePost(overrides: Partial<typeof posts.$inferInsert> = {}) {
  const [row] = await db.insert(posts).values(draft(overrides)).returning();
  return publishPost(db, row.id, "user-1");
}

describe("published content", () => {
  it("hides drafts and sorts posts newest first", async () => {
    await livePost({ slug: "older", date: "2026-01-01" });
    await livePost({ slug: "newer", date: "2026-02-01" });
    await db.insert(posts).values(draft({ slug: "draft", date: "2026-03-01" }));
    expect((await publishedPosts(db)).map((p) => p.slug)).toEqual(["newer", "older"]);
    expect(await publishedPost(db, "draft")).toBeNull();
  });

  it("refuses to mark content live without a published version", async () => {
    await expect(db.insert(posts).values(draft({ state: "published" }))).rejects.toThrow();
  });

  it("reads calendar dates back without time-zone drift", async () => {
    await livePost({ date: "2026-03-15", updated: "2026-04-02" });
    const [p] = await publishedPosts(db);
    expect([p.date, p.updated]).toEqual(["2026-03-15", "2026-04-02"]);
  });

  it("falls back to a summary when there's no excerpt", async () => {
    await livePost();
    expect((await publishedPost(db, "hello"))?.description).toBe("First paragraph of the post.");
  });

  it("enforces slug format and uniqueness", async () => {
    await expect(db.insert(posts).values(draft({ slug: "Bad Slug" }))).rejects.toThrow();
    await db.insert(posts).values(draft());
    await expect(db.insert(posts).values(draft())).rejects.toThrow();
  });

  it("orders projects and splits talks by date", async () => {
    const rows = await db
      .insert(projects)
      .values([
        { slug: "b", title: "B", sortOrder: 2 },
        { slug: "a", title: "A", sortOrder: 1 },
        { slug: "c", title: "C", sortOrder: 0 },
      ])
      .returning();
    for (const row of rows.filter((r) => r.slug !== "c")) await publishProject(db, row.id);
    expect((await publishedProjects(db)).map((p) => p.slug)).toEqual(["a", "b"]);

    await db.insert(talks).values([
      { slug: "soon", title: "Soon", date: "2026-12-01", state: "published", links: [{ label: "Slides", url: "https://x.test" }] },
      { slug: "done", title: "Done", date: "2026-01-01", state: "published" },
      { slug: "forced", title: "Forced", date: "2025-01-01", upcoming: true, state: "published" },
      { slug: "hidden", title: "Hidden", date: "2026-12-02" },
    ]);
    const { upcoming, past } = await publishedTalks(db, new Date(2026, 5, 1));
    expect(upcoming.map((t) => t.slug)).toEqual(["forced", "soon"]);
    expect(past.map((t) => t.slug)).toEqual(["done"]);
    expect(upcoming[1].links).toEqual([{ label: "Slides", url: "https://x.test" }]);
  });
});

describe("drafts vs. live", () => {
  it("keeps serving the published version while the draft changes", async () => {
    const live = await livePost({ title: "Live title" });
    await db.update(posts).set({ title: "Draft title", slug: "renamed" }).where(eq(posts.id, live.id));
    const p = await publishedPost(db, "hello");
    expect(p?.title).toBe("Live title");
    expect(await publishedPost(db, "renamed")).toBeNull();

    await publishPost(db, live.id);
    expect(await publishedPost(db, "hello")).toBeNull();
    expect((await publishedPost(db, "renamed"))?.title).toBe("Draft title");
  });

  it("unpublishing takes the post off the site but keeps the draft and history", async () => {
    const live = await livePost();
    await unpublishPost(db, live.id);
    expect(await publishedPosts(db)).toEqual([]);
    const [row] = await db.select().from(posts).where(eq(posts.id, live.id));
    expect(row.title).toBe("Hello");
    expect(await listRevisions(db, { postId: live.id }, "published")).toHaveLength(1);
  });

  it("republishing unchanged content reuses the live version", async () => {
    const live = await livePost();
    const again = await publishPost(db, live.id);
    expect(again.publishedRevisionId).toBe(live.publishedRevisionId);
    expect(await listRevisions(db, { postId: live.id }, "published")).toHaveLength(1);
  });

  it("records who published, and shows the byline instead", async () => {
    const live = await livePost({ byline: "Dyllen Owens" });
    expect(live.updatedBy).toBe("user-1");
    expect((await publishedPost(db, "hello"))?.author).toBe("Dyllen Owens");

    await db.update(posts).set({ byline: "Guest Author" }).where(eq(posts.id, live.id));
    expect((await publishedPost(db, "hello"))?.author).toBe("Dyllen Owens");
    await publishPost(db, live.id);
    expect((await publishedPost(db, "hello"))?.author).toBe("Guest Author");
  });

  it("shows the site owner when there's no byline", async () => {
    await livePost({ byline: null });
    expect((await publishedPost(db, "hello"))?.author).toBe("Dyllen Owens");
  });
});

describe("post photos", () => {
  async function withPhoto(body: string) {
    const [row] = await db.insert(posts).values(draft({ body })).returning();
    await db.insert(assets).values({
      postId: row.id,
      name: "harbor.jpg",
      blobUrl: "https://blob.test/writing/hello/harbor-abc.jpg",
      blobPathname: "writing/hello/harbor-abc.jpg",
      contentType: "image/jpeg",
      width: 1600,
      height: 1067,
      bytes: 1234,
    });
    return publishPost(db, row.id);
  }

  it("resolves photos to versioned site URLs with their dimensions", async () => {
    await withPhoto('![Boats](harbor.jpg#right "Dawn")');
    const p = (await publishedPost(db, "hello"))!;
    expect(p.content).toMatch(
      /<figure class="align-right"><img src="\/writing\/hello\/harbor\.jpg\?v=[a-z0-9]+" alt="Boats" loading="lazy" decoding="async" width="1600" height="1067" style="aspect-ratio:1600\/1067;width:min\(100%,1600px,calc\(min\(80vh, 760px\) \* 1\.4995\)\);height:auto"><figcaption>Dawn<\/figcaption><\/figure>/,
    );
    expect(p.images).toEqual(["harbor.jpg"]);
    expect(p.markdown).toContain("](https://owinz.io/writing/hello/harbor.jpg#right");
  });

  it("serves only photos the live version shows", async () => {
    const live = await withPhoto("No photos referenced.");
    expect(await publishedPostAsset(db, "hello", "harbor.jpg")).toBeNull();
    // Adding it to the draft doesn't publish it…
    await db.update(posts).set({ body: "![Boats](harbor.jpg)" }).where(eq(posts.id, live.id));
    expect(await publishedPostAsset(db, "hello", "harbor.jpg")).toBeNull();
    // …publishing does.
    await publishPost(db, live.id);
    expect((await publishedPostAsset(db, "hello", "harbor.jpg"))?.contentType).toBe("image/jpeg");
    await unpublishPost(db, live.id);
    expect(await publishedPostAsset(db, "hello", "harbor.jpg")).toBeNull();
  });

  it("requires exactly one owner per photo", async () => {
    await expect(
      db.insert(assets).values({ name: "x.jpg", blobUrl: "u", blobPathname: "p", contentType: "image/jpeg", bytes: 1 }),
    ).rejects.toThrow();
  });
});

describe("revisions", () => {
  let owner: { postId: string };
  beforeEach(async () => {
    const [row] = await db.insert(posts).values(draft()).returning();
    owner = { postId: row.id };
  });

  it("hashes snapshots independently of key order", () => {
    expect(snapshotHash({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(snapshotHash({ b: [1, { d: 3, c: 2 }], a: 1 }));
    expect(snapshotHash({ a: 1 })).not.toBe(snapshotHash({ a: 2 }));
  });

  it("skips an autosave when nothing changed", async () => {
    expect((await saveRevision(db, owner, "autosave", { body: "one" })).saved).toBe(true);
    expect((await saveRevision(db, owner, "autosave", { body: "one" })).saved).toBe(false);
    expect((await saveRevision(db, owner, "autosave", { body: "two" })).saved).toBe(true);
    expect(await listRevisions(db, owner)).toHaveLength(2);
  });

  it("skips an autosave identical to the last publish", async () => {
    await saveRevision(db, owner, "published", { body: "live" });
    expect((await saveRevision(db, owner, "autosave", { body: "live" })).saved).toBe(false);
  });

  it(`keeps the newest ${REVISION_LIMITS.autosave} autosaves and ${REVISION_LIMITS.published} publishes`, async () => {
    for (let i = 0; i < REVISION_LIMITS.autosave + 5; i++) {
      await saveRevision(db, owner, "autosave", { body: `draft ${i}` });
    }
    for (let i = 0; i < REVISION_LIMITS.published + 3; i++) {
      await saveRevision(db, owner, "published", { body: `live ${i}` });
    }
    const autosaves = await listRevisions(db, owner, "autosave");
    const published = await listRevisions(db, owner, "published");
    expect(autosaves).toHaveLength(REVISION_LIMITS.autosave);
    expect(published).toHaveLength(REVISION_LIMITS.published);
    // Newest first, and the oldest were the ones pruned.
    expect(autosaves[0].snapshot).toEqual({ body: `draft ${REVISION_LIMITS.autosave + 4}` });
    expect(autosaves.at(-1)!.snapshot).toEqual({ body: "draft 5" });
    expect(published.at(-1)!.snapshot).toEqual({ body: "live 3" });
  });

  it("never prunes the version the site is showing", async () => {
    const live = await publishPost(db, owner.postId);
    // Eleven more publishes' worth of snapshots that aren't made live.
    for (let i = 0; i < REVISION_LIMITS.published + 1; i++) {
      await saveRevision(db, owner, "published", { body: `unpublished snapshot ${i}` });
    }
    const ids = (await listRevisions(db, owner, "published")).map((r) => r.id);
    expect(ids).toContain(live.publishedRevisionId);
    expect((await publishedPost(db, "hello"))?.title).toBe("Hello");
  });

  it("keeps each post's history separate and deletes it with the post", async () => {
    const [other] = await db.insert(posts).values(draft({ slug: "other" })).returning();
    await saveRevision(db, owner, "autosave", { body: "a" });
    await saveRevision(db, { postId: other.id }, "autosave", { body: "a" });
    expect(await listRevisions(db, { postId: other.id })).toHaveLength(1);
    await db.delete(posts).where(eq(posts.id, other.id));
    expect(await listRevisions(db, { postId: other.id })).toHaveLength(0);
    expect(await listRevisions(db, owner)).toHaveLength(1);
  });
});
