import { format } from "date-fns";
import Link from "next/link";
import { createProjectAction, moveProjectAction } from "./actions";
import { buttonPrimary, buttonQuiet, label, PageHeader, StateBadge } from "@/components/admin/ui";
import { getDb } from "@/lib/db";
import { can } from "@/lib/cms/permissions";
import { listProjects } from "@/lib/cms/projects";
import { requireCmsUser } from "@/lib/cms/session";

export const metadata = { title: "Projects" };
// The CMS is signed-in and dynamic: navigations may wait for data (opts out of
// the instant-navigation check, which is per page, not inherited from layouts).
export const instant = false;

export default async function ProjectListPage() {
  const user = await requireCmsUser();
  const items = await listProjects(getDb(), user);
  const canReorder = can(user, "reorder");

  return (
    <div className="max-w-[880px]">
      <PageHeader eyebrow={`Projects · ${items.length}`} title="Projects.">
        {can(user, "create") && (
          <form action={createProjectAction}>
            <button type="submit" className={buttonPrimary}>
              New project
            </button>
          </form>
        )}
      </PageHeader>

      <p className="-mt-4 mb-8 text-sm text-muted">
        In the order /projects shows them.{" "}
        {canReorder ? "Moving one applies to the site at once; drafts take their place when published." : null}
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-muted">No projects yet.</p>
      ) : (
        <ol className="border-t border-edge">
          {items.map((item, i) => (
            <li key={item.id} className="flex items-stretch border-b border-edge">
              <span className={`${label} w-10 shrink-0 pt-[1.35rem]`}>{String(i + 1).padStart(2, "0")}</span>
              <Link
                href={`/admin/projects/${item.id}/`}
                className="grid min-w-0 flex-1 grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 py-4 transition-colors hover:bg-accent/5"
              >
                <span className="font-fraunces text-xl tracking-[-0.2px] leading-snug">{item.title}</span>
                <span className="flex items-center gap-2">
                  {item.unpublishedChanges && <span className={`${label} text-accent`}>Edited</span>}
                  {!item.canEdit && <span className={label}>View only</span>}
                  <StateBadge state={item.state} />
                </span>
                <span className={`${label} col-span-2`}>
                  /projects/{item.slug}
                  {item.category && ` · ${item.category}`} · updated {format(item.updatedAt, "d MMM, HH:mm")}
                  {item.updatedBy && ` by ${item.updatedBy}`}
                </span>
              </Link>
              {canReorder && (
                <div className="flex shrink-0 flex-col justify-center gap-1 pl-4">
                  <form action={moveProjectAction.bind(null, item.id, -1)}>
                    <button
                      type="submit"
                      disabled={i === 0}
                      aria-label={`Move ${item.title} up`}
                      className={`${buttonQuiet} px-1`}
                    >
                      ↑
                    </button>
                  </form>
                  <form action={moveProjectAction.bind(null, item.id, 1)}>
                    <button
                      type="submit"
                      disabled={i === items.length - 1}
                      aria-label={`Move ${item.title} down`}
                      className={`${buttonQuiet} px-1`}
                    >
                      ↓
                    </button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
