import Link from "next/link";
import { notFound } from "next/navigation";
import { TaxonomyManager } from "@/components/admin/TaxonomyManager";
import { label, PageHeader } from "@/components/admin/ui";
import { getDb } from "@/lib/db";
import { can } from "@/lib/cms/permissions";
import { requireCmsUser } from "@/lib/cms/session";
import { listTaxonomy } from "@/lib/cms/taxonomy";
import type { Collection } from "@/lib/content/terms";
import { cn } from "@/lib/utils";

export const metadata = { title: "Categories & tags" };
// The CMS is signed-in and dynamic: navigations may wait for data (opts out of
// the instant-navigation check, which is per page, not inherited from layouts).
export const instant = false;

const TABS: { collection: Collection; label: string; href: string }[] = [
  { collection: "writing", label: "Writing", href: "/admin/taxonomy/" },
  { collection: "projects", label: "Projects", href: "/admin/taxonomy/?collection=projects" },
];

export default async function TaxonomyPage({ searchParams }: { searchParams: Promise<{ collection?: string }> }) {
  const user = await requireCmsUser();
  if (!can(user, "manageTaxonomy")) notFound();
  const collection: Collection = (await searchParams).collection === "projects" ? "projects" : "writing";
  const { categories, tags } = await listTaxonomy(getDb(), collection);
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
      <PageHeader eyebrow={collection === "projects" ? "Projects" : "Writing"} title="Categories & tags." />
      <nav aria-label="Collection" className="-mt-4 mb-10 flex gap-6 border-b border-edge">
        {TABS.map((tab) => (
          <Link
            key={tab.collection}
            href={tab.href}
            aria-current={tab.collection === collection ? "page" : undefined}
            className={cn(
              label,
              "-mb-px border-b pb-3 transition-colors hover:text-accent",
              tab.collection === collection ? "border-accent text-accent" : "border-transparent",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <TaxonomyManager
        key={collection}
        collection={collection}
        categories={categories.map(plain)}
        tags={tags.map(plain)}
      />
    </div>
  );
}
