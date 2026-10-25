// The signed-in CMS user, for server components and server actions. Every
// admin page and action goes through here; proxy.ts only redirects early.
import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "../auth";
import { assertCan, isRole, type Action, type Actor, type DocumentRef } from "./permissions";
import { displayName } from "./users";

export interface CmsUser extends Actor {
  name: string;
  email: string;
  image: string | null;
}

/** The session's user, or null. Deduplicated per request. */
export const getCmsUser = cache(async (): Promise<CmsUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user || !isRole(user.role)) return null;
  return {
    id: user.id,
    role: user.role,
    name: displayName(user.email, user.name),
    email: user.email,
    image: user.image ?? null,
  };
});

/** For admin pages: the user, or a redirect to the sign-in page. */
export async function requireCmsUser(): Promise<CmsUser> {
  const user = await getCmsUser();
  if (!user) redirect("/admin/login/");
  return user;
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Your session has ended. Sign in again.");
  }
}

/** For server actions: the user, checked against an action; throws otherwise. */
export async function authorize(action: Action, doc?: DocumentRef): Promise<CmsUser> {
  const user = await getCmsUser();
  if (!user) throw new UnauthenticatedError();
  assertCan(user, action, doc);
  return user;
}
