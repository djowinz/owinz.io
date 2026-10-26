import { format } from "date-fns";
import Link from "next/link";
import { label, PageHeader, SectionTitle, StateBadge } from "@/components/admin/ui";
import { overview, type CollectionOverview } from "@/lib/cms/dashboard";
import { requireCmsUser } from "@/lib/cms/session";
import { getDb } from "@/lib/db";

export const metadata = { title: "Overview" };

function Collection({ title, data, href }: { title: string; data: CollectionOverview; href?: string }) {
  return (
    <section>
      <SectionTitle aside={`${data.live} live · ${data.drafts} draft${data.drafts === 1 ? "" : "s"}`}>
        {title}
      </SectionTitle>
      {data.items.length === 0 ? (
        <p className="py-5 text-sm text-muted">Nothing here yet.</p>
      ) : (
        <ul>
          {data.items.slice(0, 8).map((item) => (
            <li
              key={item.id}
              className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 py-3.5 border-b border-edge last:border-none"
            >
              {href ? (
                <Link href={`${href}${item.id}/`} className="font-fraunces text-lg tracking-[-0.18px] leading-snug transition-colors hover:text-accent">
                  {item.title || "Untitled"}
                </Link>
              ) : (
                <span className="font-fraunces text-lg tracking-[-0.18px] leading-snug">{item.title}</span>
              )}
              <span className="flex items-center gap-2">
                {item.unpublishedChanges && <span className={`${label} text-accent`}>Edited</span>}
                <StateBadge state={item.state} />
              </span>
              <span className={`${label} col-span-2`}>
                /{item.slug} · updated {format(item.updatedAt, "d MMM yyyy")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function OverviewPage() {
  const user = await requireCmsUser();
  const data = await overview(getDb());
  return (
    <div className="max-w-[880px]">
      <PageHeader
        eyebrow="Overview"
        title={
          <>
            Hello, <em className="font-fraunces-italic text-accent">{user.name.split(" ")[0]}</em>.
          </>
        }
      />
      <div className="grid gap-14">
        <Collection title="Writing" data={data.writing} href="/admin/writing/" />
        <Collection title="Projects" data={data.projects} href="/admin/projects/" />
        <Collection title="Talks" data={data.talks} href="/admin/talks/" />
      </div>
    </div>
  );
}
