import CursorWrangler from "@/components/CursorWrangler";
import { JsonLd } from "@/components/JsonLd";
import MobileHeader from "@/components/MobileHeader";
import Sidebar from "@/components/Sidebar";
import { siteSchema } from "@/lib/schema";

// The public site's frame: sidebar (or mobile header), content column, and
// the custom cursor. The CMS under /admin has its own.
export default function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-fine:cursor-none">
      <JsonLd data={siteSchema()} />
      <CursorWrangler />
      <div className="min-h-screen mx-auto max-w-7xl lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
        {/* Top bar + menu below lg */}
        <MobileHeader />
        {/* Sidebar Column (lg+) */}
        <aside className="relative hidden lg:block bg-(--sidebar) before:absolute before:inset-y-0 before:right-full before:w-screen before:bg-(--sidebar) border-r border-(--edge)">
          <Sidebar />
        </aside>
        {/* Content Column */}
        <main className="relative min-w-0 bg-background px-5 py-10 sm:px-8 sm:py-14 md:px-12 lg:px-18 lg:py-20 after:absolute after:inset-y-0 after:left-full after:bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
