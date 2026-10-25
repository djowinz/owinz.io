import { format } from "date-fns";
import Link from "next/link";
import { createTalkAction } from "./actions";
import { buttonPrimary, label, PageHeader, SectionTitle, StateBadge } from "@/components/admin/ui";
import { getDb } from "@/lib/db";
import { parseDate } from "@/lib/dates";
import { can } from "@/lib/cms/permissions";
import { listTalks, type TalkListItem } from "@/lib/cms/talks";
import { requireCmsUser } from "@/lib/cms/session";

export const metadata = { title: "Talks" };
// The CMS is signed-in and dynamic: navigations may wait for data (opts out of
// the instant-navigation check, which is per page, not inherited from layouts).
export const instant = false;

function displayDate(raw: string) {
  const date = parseDate(raw);
  return date ? format(date, "d MMM yyyy") : raw;
}

function Group({ title, items, empty }: { title: string; items: TalkListItem[]; empty: string }) {
  return (
    <section>
      <SectionTitle aside={`${items.length}`}>{title}</SectionTitle>
      {items.length === 0 ? (
        <p className="py-5 text-sm text-muted">{empty}</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id} className="border-b border-edge last:border-none">
              <Link
                href={`/admin/talks/${item.id}/`}
                className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 py-4 transition-colors hover:bg-accent/5"
              >
                <span className="font-fraunces text-xl tracking-[-0.2px] leading-snug">{item.title}</span>
                <span className="flex items-center gap-2">
                  {!item.canEdit && <span className={label}>View only</span>}
                  <StateBadge state={item.state} />
                </span>
                <span className={`${label} col-span-2`}>
                  {displayDate(item.date)}
                  {item.venue && ` · ${item.venue}`}
                  {item.forced && " · placed by hand"} · updated {format(item.updatedAt, "d MMM, HH:mm")}
                  {item.updatedBy && ` by ${item.updatedBy}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function TalksListPage() {
  const user = await requireCmsUser();
  const { upcoming, past } = await listTalks(getDb(), user);

  return (
    <div className="max-w-[880px]">
      <PageHeader eyebrow={`Talks · ${upcoming.length + past.length}`} title="Talks.">
        {can(user, "create") && (
          <form action={createTalkAction}>
            <button type="submit" className={buttonPrimary}>
              New talk
            </button>
          </form>
        )}
      </PageHeader>
      <div className="grid gap-14">
        <Group title="Upcoming" items={upcoming} empty="No upcoming talks." />
        <Group title="Past" items={past} empty="No past talks yet." />
      </div>
    </div>
  );
}
