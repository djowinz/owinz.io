// Who may do what in the CMS. Every server action checks here, after
// authenticating the session; the UI uses it only to hide buttons.
//
//   editor       everything, including deleting content and managing users
//   writer       create and edit anything, publish, unpublish, restore versions,
//                manage categories and tags
//   contributor  create content (and new tags) and edit their own until it's
//                first published; can't publish, unpublish, restore, delete, or
//                change existing categories and tags

export const ROLES = ["editor", "writer", "contributor"] as const;
export type Role = (typeof ROLES)[number];

export interface Actor {
  id: string;
  role: Role;
}

export type Action =
  | "create"
  | "edit"
  | "publish"
  | "unpublish"
  | "restore"
  | "delete"
  | "manageTaxonomy"
  | "manageUsers";

/** The parts of a post, project, or talk that permissions depend on. */
export interface DocumentRef {
  createdBy: string | null;
  state: "draft" | "published";
  /** Set once a post or project has ever been published (talks don't have one). */
  publishedRevisionId?: string | null;
}

const ROLE_ACTIONS: Record<Role, ReadonlySet<Action>> = {
  editor: new Set(["create", "edit", "publish", "unpublish", "restore", "delete", "manageTaxonomy", "manageUsers"]),
  writer: new Set(["create", "edit", "publish", "unpublish", "restore", "manageTaxonomy"]),
  contributor: new Set(["create", "edit"]),
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function can(actor: Actor, action: Action, doc?: DocumentRef): boolean {
  if (!ROLE_ACTIONS[actor.role]?.has(action)) return false;
  if (actor.role === "contributor" && action === "edit") {
    return (
      doc !== undefined &&
      doc.createdBy === actor.id &&
      doc.state === "draft" &&
      !doc.publishedRevisionId
    );
  }
  return true;
}

export class ForbiddenError extends Error {
  constructor(action: Action) {
    super(`Not allowed: ${action}`);
  }
}

/** Throws unless allowed; for server actions. */
export function assertCan(actor: Actor, action: Action, doc?: DocumentRef): void {
  if (!can(actor, action, doc)) throw new ForbiddenError(action);
}
