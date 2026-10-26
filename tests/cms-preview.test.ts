// The full-page draft preview renders the working draft (not the live
// version), with its terms, and photos from the signed-in CMS photo route.
import { afterAll, beforeAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "../lib/db";
import { assets, posts, postTags } from "../lib/db/schema";
import { ensureTerm } from "../lib/cms/taxonomy";
import { draftPost } from "../lib/cms/preview";
import { publishPost } from "../lib/content/publishing";
import { publishedPost } from "../lib/content/db";
import { testDb } from "./helpers/db";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await testDb());
});
afterAll(() => close());

it("renders the draft as the site would, with draft photos from the CMS route", async () => {
  const category = await ensureTerm(db, { kind: "category", collection: "writing", name: "Engineering" });
  const tag = await ensureTerm(db, { kind: "tag", collection: "writing", name: "Process" });
  const [row] = await db
    .insert(posts)
    .values({ slug: "hello", title: "Live title", date: "2026-03-15", body: "Live body.", categoryId: category.id })
    .returning();
  await db.insert(postTags).values({ postId: row.id, termId: tag.id, position: 0 });
  await publishPost(db, row.id);
  await db.update(posts).set({ title: "Draft title", body: '![Boats](harbor.jpg "Dawn")\n\nDraft body.' }).where(eq(posts.id, row.id));
  const [photo] = await db
    .insert(assets)
    .values({
      postId: row.id,
      name: "harbor.jpg",
      blobUrl: "local://writing/hello/harbor-x.jpg",
      blobPathname: "writing/hello/harbor-x.jpg",
      contentType: "image/jpeg",
      width: 1600,
      height: 1000,
      bytes: 1,
    })
    .returning();

  const draft = (await draftPost(db, row.id))!;
  expect(draft.title).toBe("Draft title");
  expect(draft.categoryRef).toEqual({ name: "Engineering", slug: "engineering" });
  expect(draft.tagRefs).toEqual([{ name: "Process", slug: "process" }]);
  expect(draft.content).toContain(`src="/api/cms/photos/${photo.id}/?v=`);
  expect(draft.content).toContain("Draft body.");
  expect((await publishedPost(db, "hello"))!.title).toBe("Live title");
  expect(await draftPost(db, "00000000-0000-0000-0000-000000000000")).toBeNull();
});
