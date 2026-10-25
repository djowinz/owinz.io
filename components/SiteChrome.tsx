import Link from "next/link";
import { Monogram } from "@/components/Monogram";
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
        <main className="relative flex min-w-0 flex-col bg-background px-5 py-10 sm:px-8 sm:py-14 md:px-12 lg:px-18 lg:py-20 after:absolute after:inset-y-0 after:left-full after:bg-background">
          <div className="flex-1">{children}</div>
          {/* Content panel footer: the monogram, at the foot of every page. */}
          <footer className="mt-24 sm:mt-32 flex justify-center">
            <Link href="/" aria-label="owinz.io home" className="cursor-none text-foreground transition-colors hover:text-accent">
              <Monogram className="h-7 w-auto" />
            </Link>
          </footer>
        </main>
      </div>
    </div>
  );
}
