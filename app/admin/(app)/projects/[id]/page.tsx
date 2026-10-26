import { notFound } from "next/navigation";
import { ProjectEditor } from "@/components/admin/editor/ProjectEditor";
import { getDb } from "@/lib/db";
import { can } from "@/lib/cms/permissions";
import { getProjectForEdit, ProjectError, renderProjectPreview } from "@/lib/cms/projects";
import { listTerms } from "@/lib/content/terms";
import { requireCmsUser } from "@/lib/cms/session";

export const metadata = { title: "Edit project" };
// The CMS is signed-in and dynamic: navigations may wait for data (opts out of
// the instant-navigation check, which is per page, not inherited from layouts).
export const instant = false;

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCmsUser();
  const { id } = await params;
  const data = await getProjectForEdit(getDb(), user, id).catch((err) => {
    if (err instanceof ProjectError) notFound();
    throw err;
  });
  const { project, input, photos, permissions, unpublishedChanges } = data;
  const [categories, technologies] = await Promise.all([
    listTerms(getDb(), "projects", "category"),
    listTerms(getDb(), "projects", "tag"),
  ]);
  const option = (t: { id: string; name: string; slug: string }) => ({ id: t.id, name: t.name, slug: t.slug });

  return (
    <ProjectEditor
      id={project.id}
      initial={input}
      initialPreview={await renderProjectPreview(getDb(), project.id, project.body)}
      updatedAt={project.updatedAt.toISOString()}
      state={project.state}
      publishedSlug={project.publishedSlug}
      everPublished={Boolean(project.firstPublishedAt)}
      unpublishedChanges={unpublishedChanges}
      photos={photos.map((p) => ({
        id: p.id,
        name: p.name,
        width: p.width,
        height: p.height,
        version: p.updatedAt.getTime().toString(36),
      }))}
      permissions={permissions}
      categories={categories.map(option)}
      technologies={technologies.map(option).sort((a, b) => a.name.localeCompare(b.name))}
      canManageTaxonomy={can(user, "manageTaxonomy")}
    />
  );
}
