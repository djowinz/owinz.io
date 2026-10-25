import Link from "next/link";
import SiteChrome from "@/components/SiteChrome";

export const metadata = {
  title: "Page not found",
  description: "This page doesn't exist on owinz.io.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <SiteChrome>
      <div className="max-w-[880px] mx-auto">
        <div className="flex justify-between items-baseline font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-7">
          <span>Error</span>
          <span>404</span>
        </div>
        <h1 className="font-fraunces font-light text-[56px] sm:text-[72px] md:text-[96px] tracking-[-0.035em] leading-[0.95] mb-5">
          Nothing <em className="font-fraunces-italic text-accent">here</em>.
        </h1>
        <p className="font-fraunces-italic italic font-light text-lg sm:text-[22px] leading-snug text-muted mb-12 max-w-[620px]">
          The page you were looking for has moved, or never existed. Try one of
          these instead.
        </p>
        <nav aria-label="Suggested pages" className="flex flex-wrap gap-3">
          {[
            ["/", "Home"],
            ["/writing", "Writing"],
            ["/projects", "Projects"],
            ["/contact", "Contact"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="py-3 px-5 border border-edge text-sm transition-colors hover:border-foreground cursor-none"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </SiteChrome>
  );
}
