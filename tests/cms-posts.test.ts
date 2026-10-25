import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../lib/db";
import { posts, users } from "../lib/db/schema";
import { publishedPost } from "../lib/content/db";
import { listRevisions } from "../lib/content/revisions";
import type { Actor } from "../lib/cms/permissions";
import {
  attachPhoto,
  ConflictError,
  createPost,
  deletePost,
  detachPhoto,
  getPostForEdit,
  listPosts,
  photoFileName,
  publish,
  restore,
  savePost,
  toInput,
  unpublish,
} from "../lib/cms/posts";
import { checkPostForPublish, localPhotoNames, slugify, type PostInput } from "../lib/cms/validate";
import { testDb } from "./helpers/db";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await testDb());
});
afterAll(() => close());

const editor: Actor = { id: "editor", role: "editor" };
const writer: Actor = { id: "writer", role: "writer" };
const contributor: Actor = { id: "contrib", role: "contributor" };
const otherContributor: Actor = { id: "contrib-2", role: "contributor" };

beforeEach(async () => {
  await db.execute(sql`truncate users, posts, assets, revisions cascade`);
  for (const a of [editor, writer, contributor, otherContributor]) {
    await db.insert(users).values({ id: a.id, name: `${a.id} name`, email: `${a.id}@example.com`, role: a.role });
  }
});

const ready = (overrides: Partial<PostInput> = {}): PostInput => ({
  title: "A finished post",
  slug: "a-finished-post",
  excerpt: "An excerpt that is long enough to read well in search results without being cut off.",
  category: "Engineering",
  tags: ["one"],
  date: "2026-03-15",
  updated: null,
  byline: null,
  body: "The opening paragraph.\n\n## A section\n\nMore text.\n",
  ...overrides,
});

async function edited(actor: Actor, overrides: Partial<PostInput> = {}) {
  const created = await createPost(db, actor, "Draft");
  const { post } = await savePost(db, actor, created.id, ready(overrides), created.updatedAt);
  return post;
}

describe("slugs and names", () => {
  it("slugifies titles and photo names", () => {
    expect(slugify("The Art of Debugging: A Journey!")).toBe("the-art-of-debugging-a-journey");
    expect(slugify("Café & Crème")).toBe("cafe-and-creme");
    expect(photoFileName("IMG 0042.JPEG")).toBe("img-0042.jpg");
    expect(photoFileName("Screen Shot 2026-03-01 at 9.41.12 AM.png")).toBe("screen-shot-2026-03-01-at-9-41-12-am.png");
  });

  it("gives new posts a unique slug", async () => {
    const a = await createPost(db, writer, "Same title");
    const b = await createPost(db, writer, "Same title");
    expect([a.slug, b.slug]).toEqual(["same-title", "same-title-2"]);
    expect(a.createdBy).toBe("writer");
  });
});

describe("saving drafts", () => {
  it("saves the draft and records an autosave only when something changed", async () => {
    const created = await createPost(db, writer, "Draft");
    const first = await savePost(db, writer, created.id, ready(), created.updatedAt);
    expect(first.revisionSaved).toBe(true);
    const again = await savePost(db, writer, created.id, ready(), first.post.updatedAt);
    expect(again.revisionSaved).toBe(false);
    expect(await listRevisions(db, { postId: created.id }, "autosave")).toHaveLength(1);
  });

  it("rejects an unsaveable draft and a taken URL", async () => {
    const created = await createPost(db, writer, "Draft");
    await expect(savePost(db, writer, created.id, ready({ slug: "Bad Slug" }), created.updatedAt)).rejects.toThrow("lowercase");
    await edited(writer, { slug: "taken" });
    await expect(savePost(db, writer, created.id, ready({ slug: "taken" }), created.updatedAt)).rejects.toThrow("already uses");
  });

  it("refuses to overwrite someone else's newer save", async () => {
    const created = await createPost(db, writer, "Draft");
    const opened = created.updatedAt;
    await savePost(db, editor, created.id, ready({ title: "Editor's change" }), opened);
    await expect(savePost(db, writer, created.id, ready({ title: "Writer's change" }), opened)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("never changes the live page", async () => {
    const post = await edited(writer);
    await publish(db, writer, post.id);
    const fresh = (await getPostForEdit(db, writer, post.id)).post;
    await savePost(db, writer, post.id, ready({ title: "Changed in the draft" }), fresh.updatedAt);
    expect((await publishedPost(db, "a-finished-post"))?.title).toBe("A finished post");
    expect((await getPostForEdit(db, writer, post.id)).unpublishedChanges).toBe(true);
  });
});

describe("roles in the editor", () => {
  it("contributors draft their own posts but can't publish", async () => {
    const mine = await edited(contributor);
    await expect(publish(db, contributor, mine.id)).rejects.toThrow("Not allowed");
    const p = await getPostForEdit(db, contributor, mine.id);
    expect(p.permissions).toEqual({ edit: true, publish: false, unpublish: false, restore: false, delete: false });
    await expect(savePost(db, otherContributor, mine.id, ready(), mine.updatedAt)).rejects.toThrow("Not allowed");
  });

  it("contributors lose edit access once a writer publishes their post", async () => {
    const mine = await edited(contributor);
    await publish(db, writer, mine.id);
    const fresh = (await getPostForEdit(db, writer, mine.id)).post;
    await expect(savePost(db, contributor, mine.id, ready({ title: "x" }), fresh.updatedAt)).rejects.toThrow("Not allowed");
    expect((await listPosts(db, contributor)).find((p) => p.id === mine.id)?.canEdit).toBe(false);
  });

  it("writers publish and unpublish; only editors delete", async () => {
    const post = await edited(writer);
    await publish(db, writer, post.id);
    await unpublish(db, writer, post.id);
    await expect(deletePost(db, writer, post.id)).rejects.toThrow("Not allowed");
    await deletePost(db, editor, post.id);
    expect(await db.select().from(posts).where(eq(posts.id, post.id))).toHaveLength(0);
  });
});

describe("publishing", () => {
  it("blocks on errors and reports warnings", () => {
    const photos = new Set(["harbor.jpg"]);
    expect(checkPostForPublish(ready(), photos).errors).toEqual([]);
    const bad = checkPostForPublish(
      ready({
        title: "",
        body: "![](missing.jpg) ![ok](harbor.jpg#rigth) # Heading",
        updated: "2026-01-01",
        excerpt: "",
      }),
      photos,
    );
    const messages = bad.errors.map((e) => e.message).join(" ");
    for (const expected of ["Add a title", "before the publish date", "unknown placement #rigth", '"missing.jpg" isn\'t uploaded']) {
      expect(messages).toContain(expected);
    }
    expect(bad.warnings.map((w) => w.field)).toEqual(expect.arrayContaining(["excerpt", "body"]));
  });

  it("refuses to publish a post with errors", async () => {
    const post = await edited(writer, { body: "![Boats](harbor.jpg)" });
    await expect(publish(db, writer, post.id)).rejects.toThrow("isn't uploaded");
  });

  it("finds a post's own photos, ignoring code blocks and remote images", () => {
    expect(localPhotoNames("![a](one.jpg#left) ![b](./two.png) ![c](https://x.test/y.png)\n```\n![d](three.jpg)\n```")).toEqual([
      "one.jpg",
      "two.png",
    ]);
  });
});

describe("history", () => {
  it("restores an earlier version into the draft, and the restore can be undone", async () => {
    const created = await createPost(db, writer, "Draft");
    const v1 = await savePost(db, writer, created.id, ready({ title: "Version one" }), created.updatedAt);
    await savePost(db, writer, created.id, ready({ title: "Version two" }), v1.post.updatedAt);
    const [, versionOne] = await listRevisions(db, { postId: created.id }, "autosave");

    const restored = await restore(db, writer, created.id, versionOne.id);
    expect(restored.title).toBe("Version one");
    const titles = (await listRevisions(db, { postId: created.id })).map((r) => (r.snapshot as unknown as PostInput).title);
    expect(titles).toContain("Version two"); // the pre-restore draft is in the history

    await expect(restore(db, contributor, created.id, versionOne.id)).rejects.toThrow("Not allowed");
  });

  it("shows who saved each version", async () => {
    const post = await edited(writer);
    await publish(db, editor, post.id);
    const { revisions } = await getPostForEdit(db, editor, post.id);
    expect(revisions.map((r) => [r.kind, r.by, r.live])).toEqual([
      ["published", "editor name", true],
      ["autosave", "writer name", false],
    ]);
  });
});

describe("photos", () => {
  const photo = (name: string, pathname = `writing/p/${name}`) => ({
    name,
    blobUrl: `local://${pathname}`,
    blobPathname: pathname,
    contentType: "image/jpeg",
    width: 1600,
    height: 900,
    bytes: 1000,
  });

  it("attaches, replaces, and removes photos", async () => {
    const post = await edited(writer);
    const first = await attachPhoto(db, writer, post.id, photo("harbor.jpg", "writing/p/harbor-a.jpg"));
    expect(first.replacedPathname).toBeNull();
    const second = await attachPhoto(db, writer, post.id, photo("harbor.jpg", "writing/p/harbor-b.jpg"));
    expect(second.replacedPathname).toBe("writing/p/harbor-a.jpg");
    expect(await detachPhoto(db, writer, post.id, "harbor.jpg")).toBe("writing/p/harbor-b.jpg");
    await expect(attachPhoto(db, writer, post.id, photo("Bad Name.jpg"))).rejects.toThrow("valid photo name");
  });

  it("won't remove a photo the live page shows", async () => {
    const post = await edited(writer, { body: "![Boats](harbor.jpg)" });
    await attachPhoto(db, writer, post.id, photo("harbor.jpg"));
    await publish(db, writer, post.id);
    await expect(detachPhoto(db, writer, post.id, "harbor.jpg")).rejects.toThrow("live version shows");
  });

  it("returns stored files to delete with the post", async () => {
    const post = await edited(writer);
    await attachPhoto(db, writer, post.id, photo("a.jpg"));
    await publish(db, writer, post.id);
    const result = await deletePost(db, editor, post.id);
    expect(result).toEqual({ blobPathnames: ["writing/p/a.jpg"], liveSlug: "a-finished-post" });
    expect(await publishedPost(db, "a-finished-post")).toBeNull();
  });

  it("keeps the round trip lossless", async () => {
    const post = await edited(writer, { tags: [" a ", "a", "b"], byline: "  ", category: "" });
    expect(toInput(post)).toMatchObject({ tags: ["a", "b"], byline: null, category: null });
  });
});

describe("URLs that follow the title", () => {
  it("take the next free URL instead of failing, until the post is published", async () => {
    await edited(writer, { slug: "same" });
    const created = await createPost(db, writer, "Other");
    const { post } = await savePost(db, writer, created.id, ready({ slug: "same" }), created.updatedAt, { autoSlug: true });
    expect(post.slug).toBe("same-2");
    await expect(savePost(db, writer, created.id, ready({ slug: "same" }), post.updatedAt)).rejects.toThrow("already uses");
  });
});
