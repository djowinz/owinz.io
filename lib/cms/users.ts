// CMS membership: invite-only sign-up, roles, and removing access. The
// sign-up gate runs inside Better Auth (lib/auth.ts); the rest backs the
// /admin/users server actions. Each management function checks the actor.
import { and, asc, count, eq, isNull, ne } from "drizzle-orm";
import type { Db } from "../db";
import { invites, users, type InviteRow, type UserRow } from "../db/schema";
import { assertCan, isRole, type Actor, type Role } from "./permissions";

export class MembershipError extends Error {}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A person's name, or the part of their email before the @ when they have none. */
export function displayName(email: string, name?: string | null): string {
  return name?.trim() || email.split("@")[0];
}

/**
 * Sign-up gate: only invited emails get an account, with the invited role.
 * Returns the role to assign, or null to refuse the account.
 */
export async function admissionRole(db: Db, email: string): Promise<Role | null> {
  const [invite] = await db.select().from(invites).where(eq(invites.email, normalizeEmail(email)));
  return invite && isRole(invite.role) ? invite.role : null;
}

export async function markInviteAccepted(db: Db, email: string): Promise<void> {
  await db
    .update(invites)
    .set({ acceptedAt: new Date() })
    .where(and(eq(invites.email, normalizeEmail(email)), isNull(invites.acceptedAt)));
}

export interface Members {
  users: Pick<UserRow, "id" | "name" | "email" | "image" | "role" | "createdAt">[];
  /** Invites nobody has accepted yet. */
  pending: InviteRow[];
}

export async function listMembers(db: Db, actor: Actor): Promise<Members> {
  assertCan(actor, "manageUsers");
  const [members, pending] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email, image: users.image, role: users.role, createdAt: users.createdAt })
      .from(users)
      .orderBy(asc(users.name)),
    db.select().from(invites).where(isNull(invites.acceptedAt)).orderBy(asc(invites.email)),
  ]);
  return { users: members, pending };
}

/** Invites an email with a role (or changes a pending invite's role). */
export async function inviteMember(db: Db, actor: Actor, rawEmail: string, role: string): Promise<void> {
  assertCan(actor, "manageUsers");
  const email = normalizeEmail(rawEmail);
  if (!EMAIL.test(email)) throw new MembershipError("Enter a valid email address.");
  if (!isRole(role)) throw new MembershipError("Choose a role.");
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) throw new MembershipError(`${email} already has an account; change their role instead.`);
  await db
    .insert(invites)
    .values({ email, role, invitedBy: actor.id })
    .onConflictDoUpdate({ target: invites.email, set: { role, invitedBy: actor.id } });
}

export async function revokeInvite(db: Db, actor: Actor, rawEmail: string): Promise<void> {
  assertCan(actor, "manageUsers");
  await db.delete(invites).where(and(eq(invites.email, normalizeEmail(rawEmail)), isNull(invites.acceptedAt)));
}

async function otherEditors(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, "editor"), ne(users.id, userId)));
  return row.n;
}

export async function changeRole(db: Db, actor: Actor, userId: string, role: string): Promise<void> {
  assertCan(actor, "manageUsers");
  if (!isRole(role)) throw new MembershipError("Choose a role.");
  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (!target) throw new MembershipError("That account no longer exists.");
  if (target.role === "editor" && role !== "editor" && (await otherEditors(db, userId)) === 0) {
    throw new MembershipError("The CMS needs at least one editor. Make someone else an editor first.");
  }
  await db.update(users).set({ role }).where(eq(users.id, userId));
  await db.update(invites).set({ role }).where(eq(invites.email, target.email));
}

/** Removes the account, its sessions, and its invite; their content stays. */
export async function removeMember(db: Db, actor: Actor, userId: string): Promise<void> {
  assertCan(actor, "manageUsers");
  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (!target) return;
  if (target.role === "editor" && (await otherEditors(db, userId)) === 0) {
    throw new MembershipError("The CMS needs at least one editor. Make someone else an editor first.");
  }
  await db.delete(invites).where(eq(invites.email, target.email));
  await db.delete(users).where(eq(users.id, userId));
}
