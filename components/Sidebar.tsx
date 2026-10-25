"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { AvailabilityBadge } from "@/components/AvailabilityBadge";
import { DistortionPortrait } from "@/components/DistortionPortrait";
import { SocialLinks } from "@/components/SocialLinks";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NAV_ITEMS, isActive } from "@/lib/nav";

export default function Sidebar() {
  const pathname = usePathname();

  return (
    // Pinned to the viewport so nav and footer stay reachable on long pages.
    <div className="sticky top-0 flex h-dvh flex-col overflow-y-auto p-8">
      {/* Portrait */}
      <div className="mb-6">
        <div className="mb-6">
          <DistortionPortrait
            src="/self-portrait.svg"
            alt="Self portrait illustration"
            width={96}
            height={128}
            className="object-contain"
          />
        </div>

        {/* Author Name */}
        {/* Not a heading: each page owns its single <h1>. */}
        <p className="text-[22px] font-medium font-fraunces tracking-wide text-foreground mb-2">
          Dyllen Owens
        </p>

        {/* Blurb */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          Leader, Developer & Writer.
          <span className="block">Solving problems, sharing the process.</span>
        </p>

        <AvailabilityBadge className="mt-4" />
      </div>

      {/* Divider */}
      <div className="w-12 h-px bg-border mb-6" />

      {/* Navigation */}
      <nav aria-label="Primary" className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className={cn(
              "text-sm font-medium tracking-wide transition-colors duration-200 py-1 cursor-none",
              isActive(pathname, item.href)
                ? "text-accent font-fraunces font-semibold italic"
                : "text-muted-foreground hover:text-accent",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Profiles */}
      <SocialLinks className="mt-8 mb-4" />

      {/* Footer */}
      <div className="w-full flex items-center justify-between font-mono text-[11px] tracking-[0.2px] text-muted-foreground">
        <span>MMXXVI</span>
        <ThemeToggle />
      </div>
    </div>
  );
}
