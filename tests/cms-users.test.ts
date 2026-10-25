import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../lib/db";
import { invites, posts, projects, users } from "../lib/db/schema";
import { overview } from "../lib/cms/dashboard";
import type { Actor } from "../lib/cms/permissions";
import {
  admissionRole,
  changeRole,
  inviteMember,
  listMembers,
  markInviteAccepted,
  removeMember,
  revokeInvite,
} from "../lib/cms/users";
import { publishPost } from "../lib/content/publishing";
import { testDb } from "./helpers/db";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await testDb());
});
afterAll(() => close());
beforeEach(async () => {
  await db.execute(sql`truncate users, invites, posts, projects, talks, revisions cascade`);
});

const editor: Actor = { id: "u-editor", role: "editor" };
const writer: Actor = { id: "u-writer", role: "writer" };

async function addUser(id: string, role: string, email = `${id}@example.com`) {
  await db.insert(users).values({ id, name: id, email, role });
}

describe("invite-only sign-up", () => {
  it("admits only invited emails, case-insensitively, with the invited role", async () => {
    await addUser("u-editor", "editor");
    await inviteMember(db, editor, "  Ghost@Example.com ", "writer");
    expect(await admissionRole(db, "ghost@example.com")).toBe("writer");
    expect(await admissionRole(db, "GHOST@EXAMPLE.COM")).toBe("writer");
    expect(await admissionRole(db, "stranger@example.com")).toBeNull();
  });

  it("marks an invite accepted and stops listing it as pending", async () => {
    await addUser("u-editor", "editor");
    await inviteMember(db, editor, "new@example.com", "contributor");
    expect((await listMembers(db, editor)).pending).toHaveLength(1);
    await markInviteAccepted(db, "new@example.com");
    expect((await listMembers(db, editor)).pending).toHaveLength(0);
  });

  it("validates invites", async () => {
    await addUser("u-editor", "editor");
    await expect(inviteMember(db, editor, "not-an-email", "writer")).rejects.toThrow("valid email");
    await expect(inviteMember(db, editor, "a@b.co", "admin")).rejects.toThrow("Choose a role");
    await addUser("u-existing", "writer", "taken@example.com");
    await expect(inviteMember(db, editor, "taken@example.com", "writer")).rejects.toThrow("already has an account");
  });

  it("can be revoked before it's used", async () => {
    await addUser("u-editor", "editor");
    await inviteMember(db, editor, "x@example.com", "writer");
    await revokeInvite(db, editor, "x@example.com");
    expect(await admissionRole(db, "x@example.com")).toBeNull();
  });
});

describe("managing people", () => {
  beforeEach(async () => {
    await addUser("u-editor", "editor");
    await addUser("u-writer", "writer");
  });

  it("is limited to editors", async () => {
    await expect(listMembers(db, writer)).rejects.toThrow("Not allowed");
    await expect(inviteMember(db, writer, "a@example.com", "editor")).rejects.toThrow("Not allowed");
    await expect(changeRole(db, writer, "u-writer", "editor")).rejects.toThrow("Not allowed");
    await expect(removeMember(db, writer, "u-editor")).rejects.toThrow("Not allowed");
  });

  it("changes roles, but never demotes or removes the last editor", async () => {
    await changeRole(db, editor, "u-writer", "contributor");
    expect((await db.select().from(users).where(eq(users.id, "u-writer")))[0].role).toBe("contributor");
    await expect(changeRole(db, editor, "u-editor", "writer")).rejects.toThrow("at least one editor");
    await expect(removeMember(db, editor, "u-editor")).rejects.toThrow("at least one editor");
    await changeRole(db, editor, "u-writer", "editor");
    await changeRole(db, editor, "u-editor", "writer");
  });

  it("removes access but keeps the person's content", async () => {
    await inviteMember(db, editor, "temp@example.com", "contributor");
    await addUser("u-temp", "contributor", "temp@example.com");
    const [post] = await db
      .insert(posts)
      .values({ slug: "theirs", title: "Theirs", date: "2026-01-01", createdBy: "u-temp" })
      .returning();
    await removeMember(db, editor, "u-temp");
    expect(await db.select().from(users).where(eq(users.id, "u-temp"))).toHaveLength(0);
    expect(await db.select().from(invites).where(eq(invites.email, "temp@example.com"))).toHaveLength(0);
    const [kept] = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(kept.title).toBe("Theirs");
    expect(kept.createdBy).toBeNull();
  });

  it("rejects invalid roles at the database too", async () => {
    await expect(db.insert(users).values({ id: "x", name: "x", email: "x@x.co", role: "admin" })).rejects.toThrow();
  });
});

describe("overview", () => {
  it("counts live and draft content and flags unpublished edits", async () => {
    const [a] = await db.insert(posts).values({ slug: "a", title: "A", date: "2026-01-01" }).returning();
    await db.insert(posts).values({ slug: "b", title: "B", date: "2026-01-02" });
    await db.insert(projects).values({ slug: "p", title: "P" });
    await publishPost(db, a.id);

    let data = await overview(db);
    expect([data.writing.live, data.writing.drafts]).toEqual([1, 1]);
    expect(data.writing.items.find((i) => i.slug === "a")?.unpublishedChanges).toBe(false);
    expect(data.projects.drafts).toBe(1);

    await db.update(posts).set({ title: "A, edited" }).where(eq(posts.id, a.id));
    data = await overview(db);
    expect(data.writing.items.find((i) => i.slug === "a")?.unpublishedChanges).toBe(true);
  });
});
