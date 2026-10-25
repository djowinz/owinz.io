import { format } from "date-fns";
import Link from "next/link";
import { createPostAction } from "./actions";
import { buttonPrimary, label, PageHeader, StateBadge } from "@/components/admin/ui";
import { getDb } from "@/lib/db";
import { can } from "@/lib/cms/permissions";
import { listPosts } from "@/lib/cms/posts";
import { requireCmsUser } from "@/lib/cms/session";

export const metadata = { title: "Writing" };

export default async function WritingListPage() {
  const user = await requireCmsUser();
  const items = await listPosts(getDb(), user);

  return (
    <div className="max-w-[880px]">
      <PageHeader eyebrow={`Writing · ${items.length}`} title="Writing.">
        {can(user, "create") && (
          <form action={createPostAction}>
            <button type="submit" className={buttonPrimary}>
              New post
            </button>
          </form>
        )}
      </PageHeader>

      {items.length === 0 ? (
        <p className="text-sm text-muted">No posts yet.</p>
      ) : (
        <ul className="border-t border-edge">
          {items.map((item) => (
            <li key={item.id} className="border-b border-edge">
              <Link
                href={`/admin/writing/${item.id}/`}
                className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 py-4 transition-colors hover:bg-accent/5"
              >
                <span className="font-fraunces text-xl tracking-[-0.2px] leading-snug">{item.title}</span>
                <span className="flex items-center gap-2">
                  {item.unpublishedChanges && <span className={`${label} text-accent`}>Edited</span>}
                  {!item.canEdit && <span className={label}>View only</span>}
                  <StateBadge state={item.state} />
                </span>
                <span className={`${label} col-span-2`}>
                  /writing/{item.slug} · {item.date} · updated {format(item.updatedAt, "d MMM, HH:mm")}
                  {item.updatedBy && ` by ${item.updatedBy}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
