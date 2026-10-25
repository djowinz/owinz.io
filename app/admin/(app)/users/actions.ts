"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { ForbiddenError } from "@/lib/cms/permissions";
import { authorize, UnauthenticatedError } from "@/lib/cms/session";
import { changeRole, inviteMember, MembershipError, removeMember, revokeInvite } from "@/lib/cms/users";

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

// Every action re-authenticates and checks the role itself; the page hiding
// these controls from non-editors is not the protection.
async function run(fn: (actor: Awaited<ReturnType<typeof authorize>>) => Promise<void>): Promise<ActionResult> {
  try {
    const actor = await authorize("manageUsers");
    await fn(actor);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    if (err instanceof MembershipError || err instanceof UnauthenticatedError) return { error: err.message };
    if (err instanceof ForbiddenError) return { error: "Only editors can manage people." };
    throw err;
  }
}

export async function inviteAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return run((actor) => inviteMember(getDb(), actor, String(form.get("email") ?? ""), String(form.get("role") ?? "")));
}

export async function revokeInviteAction(email: string): Promise<ActionResult> {
  return run((actor) => revokeInvite(getDb(), actor, email));
}

export async function changeRoleAction(userId: string, role: string): Promise<ActionResult> {
  return run((actor) => changeRole(getDb(), actor, userId, role));
}

export async function removeMemberAction(userId: string): Promise<ActionResult> {
  return run(async (actor) => {
    if (actor.id === userId) throw new MembershipError("You can't remove yourself.");
    await removeMember(getDb(), actor, userId);
  });
}
