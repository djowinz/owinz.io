import { notFound } from "next/navigation";
import { PostEditor } from "@/components/admin/editor/PostEditor";
import { getDb } from "@/lib/db";
import { getPostForEdit, PostError } from "@/lib/cms/posts";
import { can } from "@/lib/cms/permissions";
import { listTerms } from "@/lib/content/terms";
import { renderDraftPreview } from "@/lib/cms/preview";
import { requireCmsUser } from "@/lib/cms/session";
import { SITE } from "@/lib/site";

export const metadata = { title: "Edit post" };
// The CMS is signed-in and dynamic: navigations may wait for data (opts out of
// the instant-navigation check, which is per page, not inherited from layouts).
export const instant = false;

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCmsUser();
  const { id } = await params;
  const data = await getPostForEdit(getDb(), user, id).catch((err) => {
    if (err instanceof PostError) notFound();
    throw err;
  });
  const { post, input, photos, permissions, unpublishedChanges } = data;
  const [categories, tags] = await Promise.all([
    listTerms(getDb(), "writing", "category"),
    listTerms(getDb(), "writing", "tag"),
  ]);
  const option = (t: { id: string; name: string; slug: string }) => ({ id: t.id, name: t.name, slug: t.slug });

  return (
    <PostEditor
      id={post.id}
      initial={input}
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
      categories={categories.map(option)}
      tags={tags.map(option).sort((a, b) => a.name.localeCompare(b.name))}
      canManageTaxonomy={can(user, "manageTaxonomy")}
    />
  );
}
