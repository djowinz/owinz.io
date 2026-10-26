import { format } from "date-fns";
import { notFound } from "next/navigation";
import { InviteForm, MemberControls, RevokeInviteButton } from "@/components/admin/Members";
import { label, PageHeader, SectionTitle } from "@/components/admin/ui";
import { getDb } from "@/lib/db";
import { can } from "@/lib/cms/permissions";
import { requireCmsUser } from "@/lib/cms/session";
import { displayName, listMembers } from "@/lib/cms/users";

export const metadata = { title: "People" };
// The CMS is signed-in and dynamic: navigations may wait for data (opts out of
// the instant-navigation check, which is per page, not inherited from layouts).
export const instant = false;

export default async function PeoplePage() {
  const user = await requireCmsUser();
  if (!can(user, "manageUsers")) notFound();
  const { users, pending } = await listMembers(getDb(), user);

  return (
    <div className="max-w-[880px]">
      <PageHeader eyebrow="People" title="Who can sign in." />

      <section className="mb-14">
        <SectionTitle>Invite someone</SectionTitle>
        <p className="py-4 text-sm text-muted leading-relaxed">
          They sign in with the GitHub account whose primary email matches. Editors manage everything, including
          people and deleting content; writers edit, publish, and unpublish; contributors draft new content but
          can&apos;t publish.
        </p>
        <InviteForm />
      </section>

      <section className="mb-14">
        <SectionTitle aside={`${users.length}`}>Members</SectionTitle>
        <ul>
          {users.map((member) => (
            <li key={member.id} className="flex flex-wrap items-center justify-between gap-4 py-4 border-b border-edge last:border-none">
              <div className="min-w-0">
                <div className="font-fraunces text-lg leading-snug">
                  {displayName(member.email, member.name)}
                  {member.id === user.id && <span className={`${label} ml-2`}>You</span>}
                </div>
                <div className={label}>
                  {member.email} · joined {format(member.createdAt, "d MMM yyyy")}
                </div>
              </div>
              <MemberControls userId={member.id} role={member.role} isSelf={member.id === user.id} />
            </li>
          ))}
        </ul>
      </section>

      {pending.length > 0 && (
        <section>
          <SectionTitle aside={`${pending.length}`}>Pending invites</SectionTitle>
          <ul>
            {pending.map((invite) => (
              <li key={invite.email} className="flex items-center justify-between gap-4 py-4 border-b border-edge last:border-none">
                <div>
                  <div className="text-sm">{invite.email}</div>
                  <div className={label}>
                    {invite.role} · invited {format(invite.createdAt, "d MMM yyyy")}
                  </div>
                </div>
                <RevokeInviteButton email={invite.email} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
