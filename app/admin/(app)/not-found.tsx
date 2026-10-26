import Link from "next/link";
import { buttonSecondary, PageHeader } from "@/components/admin/ui";

// notFound() inside the CMS (a deleted post, a page your role can't see)
// stays in the CMS chrome rather than falling back to the public 404.
export default function AdminNotFound() {
  return (
    <div className="max-w-[880px]">
      <PageHeader eyebrow="404" title="Not found." />
      <p className="text-sm text-muted mb-8 max-w-[520px]">
        It may have been deleted, or it&apos;s not something your role can open.
      </p>
      <Link href="/admin/" className={buttonSecondary}>
        Back to the overview
      </Link>
    </div>
  );
}
