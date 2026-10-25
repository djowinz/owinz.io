import { notFound } from "next/navigation";
import { PostEditor } from "@/components/admin/editor/PostEditor";
import { getDb } from "@/lib/db";
import { getPostForEdit, PostError, toInput } from "@/lib/cms/posts";
import { renderDraftPreview } from "@/lib/cms/preview";
import { requireCmsUser } from "@/lib/cms/session";
import { SITE } from "@/lib/site";

export const metadata = { title: "Edit post" };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCmsUser();
  const { id } = await params;
  const data = await getPostForEdit(getDb(), user, id).catch((err) => {
    if (err instanceof PostError) notFound();
    throw err;
  });
  const { post, photos, permissions, unpublishedChanges } = data;

  return (
    <PostEditor
      id={post.id}
      initial={toInput(post)}
      initialPreview={await renderDraftPreview(getDb(), post.id, post.body)}
      updatedAt={post.updatedAt.toISOString()}
      state={post.state}
      publishedSlug={post.publishedSlug}
      everPublished={Boolean(post.publishedRevisionId)}
      unpublishedChanges={unpublishedChanges}
      photos={photos.map((p) => ({
        id: p.id,
        name: p.name,
        width: p.width,
        height: p.height,
        version: p.updatedAt.getTime().toString(36),
      }))}
      permissions={permissions}
      defaultByline={SITE.name}
    />
  );
}
