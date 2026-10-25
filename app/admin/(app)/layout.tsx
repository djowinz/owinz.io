import { Suspense } from "react";
import { AdminRail } from "@/components/admin/AdminRail";
import { label } from "@/components/admin/ui";

// Signed-in CMS pages: navigation rail + content. Pages read the session, so
// each part streams inside its own Suspense boundary.
export default function CmsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen mx-auto max-w-7xl lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="relative bg-(--sidebar) border-b lg:border-b-0 lg:border-r border-(--edge) lg:before:absolute lg:before:inset-y-0 lg:before:right-full lg:before:w-screen lg:before:bg-(--sidebar)">
        <Suspense fallback={<div className="h-14 lg:h-dvh" />}>
          <AdminRail />
        </Suspense>
      </aside>
      <main className="min-w-0 px-5 py-10 sm:px-8 sm:py-14 md:px-12 lg:px-16 lg:py-16">
        <Suspense fallback={<p className={label}>Loading…</p>}>{children}</Suspense>
      </main>
    </div>
  );
}
