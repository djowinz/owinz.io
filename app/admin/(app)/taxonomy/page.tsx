import { notFound } from "next/navigation";
import { TaxonomyManager } from "@/components/admin/TaxonomyManager";
import { PageHeader } from "@/components/admin/ui";
import { getDb } from "@/lib/db";
import { can } from "@/lib/cms/permissions";
import { requireCmsUser } from "@/lib/cms/session";
import { listTaxonomy } from "@/lib/cms/taxonomy";

export const metadata = { title: "Categories & tags" };

export default async function TaxonomyPage() {
  const user = await requireCmsUser();
  if (!can(user, "manageTaxonomy")) notFound();
  const { categories, tags } = await listTaxonomy(getDb(), "writing");
  const plain = (t: (typeof categories)[number]) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description,
    drafts: t.drafts,
    live: t.live,
  });
  return (
    <div className="max-w-[880px]">
      <PageHeader eyebrow="Writing" title="Categories & tags." />
      <TaxonomyManager categories={categories.map(plain)} tags={tags.map(plain)} />
    </div>
  );
}
