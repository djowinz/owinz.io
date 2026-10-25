import { describe, expect, it } from "vitest";
import { assertCan, can, isRole, type Action, type Actor, type DocumentRef } from "../lib/cms/permissions";

const editor: Actor = { id: "e", role: "editor" };
const writer: Actor = { id: "w", role: "writer" };
const contributor: Actor = { id: "c", role: "contributor" };

const ownDraft: DocumentRef = { createdBy: "c", state: "draft", publishedRevisionId: null };
const othersDraft: DocumentRef = { createdBy: "w", state: "draft", publishedRevisionId: null };
const live: DocumentRef = { createdBy: "c", state: "published", publishedRevisionId: "r1" };
const unpublished: DocumentRef = { createdBy: "c", state: "draft", publishedRevisionId: "r1" };

describe("role permissions", () => {
  it.each<[Actor, Action, boolean]>([
    [editor, "delete", true],
    [editor, "manageUsers", true],
    [writer, "publish", true],
    [writer, "unpublish", true],
    [writer, "restore", true],
    [writer, "delete", false],
    [writer, "manageUsers", false],
    [contributor, "create", true],
    [contributor, "publish", false],
    [contributor, "unpublish", false],
    [contributor, "restore", false],
    [contributor, "delete", false],
    [contributor, "manageUsers", false],
  ])("%o %s → %s", (actor, action, allowed) => {
    expect(can(actor, action, live)).toBe(allowed);
  });

  it("lets editors and writers edit anything", () => {
    for (const doc of [ownDraft, othersDraft, live, unpublished]) {
      expect(can(editor, "edit", doc)).toBe(true);
      expect(can(writer, "edit", doc)).toBe(true);
    }
  });

  it("lets contributors edit only their own never-published drafts", () => {
    expect(can(contributor, "edit", ownDraft)).toBe(true);
    expect(can(contributor, "edit", othersDraft)).toBe(false);
    expect(can(contributor, "edit", live)).toBe(false);
    expect(can(contributor, "edit", unpublished)).toBe(false);
    expect(can(contributor, "edit")).toBe(false);
  });

  it("rejects unknown roles", () => {
    expect(isRole("editor")).toBe(true);
    expect(isRole("admin")).toBe(false);
    expect(can({ id: "x", role: "admin" as never }, "create")).toBe(false);
    expect(() => assertCan(contributor, "publish", ownDraft)).toThrow("Not allowed: publish");
  });
});
