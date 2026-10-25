import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../lib/db";
import { postTags, revisions, terms, users } from "../lib/db/schema";
import { publishedPost } from "../lib/content/db";
import type { Actor } from "../lib/cms/permissions";
import { createPost, draftInput, publish, restore, savePost } from "../lib/cms/posts";
import { createTerm, deleteTerm, listTaxonomy, mergeTags, reorderCategories, updateTerm } from "../lib/cms/taxonomy";
import { listRevisions } from "../lib/content/revisions";
import type { PostInput } from "../lib/cms/validate";
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

beforeEach(async () => {
  await db.execute(sql`truncate users, posts, assets, revisions, terms cascade`);
  for (const a of [editor, writer, contributor]) {
    await db.insert(users).values({ id: a.id, name: a.id, email: `${a.id}@example.com`, role: a.role });
  }
});

const category = (name: string, actor: Actor = writer) => createTerm(db, actor, { kind: "category", collection: "writing", name });
const tag = (name: string, actor: Actor = writer) => createTerm(db, actor, { kind: "tag", collection: "writing", name });

async function livePost(slug: string, fields: Partial<PostInput>) {
  const created = await createPost(db, writer, slug);
  const input: PostInput = {
    title: slug,
    slug,
    excerpt: "",
    categoryId: null,
    tagIds: [],
    date: "2026-03-01",
    updated: null,
    byline: null,
    body: "Body text.",
    ...fields,
  };
  await savePost(db, writer, created.id, input, created.updatedAt);
  await publish(db, writer, created.id);
  return created.id;
}

describe("creating terms", () => {
  it("makes a slug, reuses an existing name regardless of case, and avoids slug clashes", async () => {
    const a = await category("Personal Finance");
    expect(a.slug).toBe("personal-finance");
    expect((await category("personal finance")).id).toBe(a.id);
    expect((await tag("C++")).slug).toBe("c");
    expect((await tag("C#")).slug).toBe("c-2");
  });

  it("lets contributors add tags but not categories", async () => {
    await expect(category("Nope", contributor)).rejects.toThrow("Not allowed");
    expect((await tag("ok", contributor)).name).toBe("ok");
  });

  it("validates names", async () => {
    await expect(category("   ")).rejects.toThrow("Give it a name");
    await expect(category("x".repeat(61))).rejects.toThrow("under 60");
  });
});

describe("posts and terms", () => {
  it("renders the category and tags of the published version, and renames show without republishing", async () => {
    const eng = await category("Engineering");
    const [t1, t2] = [await tag("debugging"), await tag("process")];
    await livePost("hello", { categoryId: eng.id, tagIds: [t2.id, t1.id] });

    let post = (await publishedPost(db, "hello"))!;
    expect(post.category).toBe("Engineering");
    expect(post.categoryRef).toEqual({ name: "Engineering", slug: "engineering" });
    expect(post.tags).toEqual(["process", "debugging"]); // author's order

    await updateTerm(db, writer, eng.id, { name: "Software Engineering", slug: "software-engineering" });
    post = (await publishedPost(db, "hello"))!;
    expect(post.categoryRef).toEqual({ name: "Software Engineering", slug: "software-engineering" });
  });

  it("rejects a category or tag that isn't a writing term of the right kind", async () => {
    const t = await tag("a-tag");
    const created = await createPost(db, writer, "x");
    const base = { ...(await draftInput(db, created)), title: "x" };
    await expect(savePost(db, writer, created.id, { ...base, categoryId: t.id }, created.updatedAt)).rejects.toThrow("category");
  });

  it("drops categories and tags deleted since a restored version", async () => {
    const [keep, gone] = [await tag("keep"), await tag("gone")];
    const created = await createPost(db, writer, "r");
    const base = await draftInput(db, created);
    const v1 = await savePost(db, writer, created.id, { ...base, tagIds: [keep.id, gone.id] }, created.updatedAt);
    await savePost(db, writer, created.id, { ...base, title: "later", tagIds: [] }, v1.post.updatedAt);
    await deleteTerm(db, writer, gone.id); // unused by the current draft and nothing is live
    const versionOne = (await listRevisions(db, { postId: created.id }, "autosave")).at(-1)!;
    const { input } = await restore(db, writer, created.id, versionOne.id);
    expect(input.tagIds).toEqual([keep.id]);
  });
});

describe("managing terms", () => {
  it("counts drafts and live versions, and won't delete a term in use", async () => {
    const eng = await category("Engineering");
    await livePost("a", { categoryId: eng.id });
    const { categories } = await listTaxonomy(db, "writing");
    expect(categories[0]).toMatchObject({ name: "Engineering", drafts: 1, live: 1 });
    await expect(deleteTerm(db, writer, eng.id)).rejects.toThrow("still used by 1 draft and 1 live post");
    await expect(deleteTerm(db, contributor, eng.id)).rejects.toThrow("Not allowed");
  });

  it("refuses renames that collide and bad slugs", async () => {
    const [a] = [await category("A"), await category("B")];
    await expect(updateTerm(db, writer, a.id, { name: "b" })).rejects.toThrow("already a category");
    await expect(updateTerm(db, writer, a.id, { slug: "Bad Slug" })).rejects.toThrow("lowercase");
  });

  it("reorders categories", async () => {
    const [a, b, c] = [await category("A"), await category("B"), await category("C")];
    await reorderCategories(db, writer, "writing", [c.id, a.id, b.id]);
    expect((await listTaxonomy(db, "writing")).categories.map((t) => t.name)).toEqual(["C", "A", "B"]);
    await expect(reorderCategories(db, writer, "writing", [a.id])).rejects.toThrow("changed");
  });

  it("merges tags across drafts and every saved version, keeping order and dropping duplicates", async () => {
    const [js, javascript, other] = [await tag("js"), await tag("JavaScript"), await tag("other")];
    const id = await livePost("m", { tagIds: [js.id, other.id, javascript.id] });

    await mergeTags(db, writer, js.id, javascript.id);

    expect(await db.select().from(terms).where(eq(terms.id, js.id))).toHaveLength(0);
    const draftTags = await db.select().from(postTags).where(eq(postTags.postId, id));
    expect(draftTags.map((t) => t.termId).sort()).toEqual([javascript.id, other.id].sort());
    for (const r of await db.select().from(revisions).where(eq(revisions.postId, id))) {
      expect((r.snapshot as { tagIds: string[] }).tagIds).toEqual([javascript.id, other.id]);
    }
    expect((await publishedPost(db, "m"))?.tags).toEqual(["JavaScript", "other"]);
  });
});
