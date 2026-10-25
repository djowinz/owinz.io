"use client";

import { useActionState, useState, useTransition } from "react";
import {
  changeRoleAction,
  inviteAction,
  removeMemberAction,
  revokeInviteAction,
  type ActionResult,
} from "@/app/admin/(app)/users/actions";
import { ROLES } from "@/lib/cms/permissions";
import { cn } from "@/lib/utils";
import { buttonDanger, buttonPrimary, FormError, input } from "./ui";

const select = cn(input, "w-auto pr-8");

export function InviteForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(inviteAction, {});
  return (
    <form action={action}>
      <div className="flex flex-wrap gap-2">
        <input name="email" type="email" required placeholder="name@example.com" className={cn(input, "w-auto flex-1 min-w-[220px]")} />
        <select name="role" defaultValue="contributor" className={select} aria-label="Role">
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {role[0].toUpperCase() + role.slice(1)}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className={buttonPrimary}>
          Invite
        </button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}

export function MemberControls({ userId, role, isSelf }: { userId: string; role: string; isSelf: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const result = await fn();
      setError(result.error ?? null);
    });

  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-4">
        <select
          defaultValue={role}
          disabled={pending}
          aria-label="Role"
          className={select}
          onChange={(e) => run(() => changeRoleAction(userId, e.target.value))}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r[0].toUpperCase() + r.slice(1)}
            </option>
          ))}
        </select>
        {!isSelf && (
          <button
            type="button"
            disabled={pending}
            className={buttonDanger}
            onClick={() => {
              if (window.confirm("Remove this person's access? Their content stays.")) run(() => removeMemberAction(userId));
            }}
          >
            Remove
          </button>
        )}
      </div>
      <FormError message={error} />
    </div>
  );
}

export function RevokeInviteButton({ email }: { email: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} className={buttonDanger} onClick={() => start(async () => void (await revokeInviteAction(email)))}>
      Revoke
    </button>
  );
}
