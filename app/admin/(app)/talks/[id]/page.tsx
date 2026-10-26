import { notFound } from "next/navigation";
import { TalkEditor } from "@/components/admin/talks/TalkEditor";
import { getDb } from "@/lib/db";
import { getTalkForEdit, TalkError } from "@/lib/cms/talks";
import { requireCmsUser } from "@/lib/cms/session";

export const metadata = { title: "Edit talk" };
// The CMS is signed-in and dynamic: navigations may wait for data (opts out of
// the instant-navigation check, which is per page, not inherited from layouts).
export const instant = false;

export default async function EditTalkPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCmsUser();
  const { id } = await params;
  const { talk, input, permissions } = await getTalkForEdit(getDb(), user, id).catch((err) => {
    if (err instanceof TalkError) notFound();
    throw err;
  });

  return (
    <TalkEditor
      id={talk.id}
      initial={input}
      updatedAt={talk.updatedAt.toISOString()}
      state={talk.state}
      permissions={permissions}
    />
  );
}
