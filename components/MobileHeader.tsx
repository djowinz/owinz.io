"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DistortionPortrait } from "@/components/DistortionPortrait";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NAV_ITEMS, isActive } from "@/lib/nav";

// Top bar + full-height menu that stands in for the sidebar below `lg`.
export default function MobileHeader() {
  const pathname = usePathname();
  // The menu remembers which path it was opened on, so any navigation
  // closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenOn(null);
    };
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 lg:hidden">
      <div className="flex h-14 items-center justify-between border-b border-edge bg-sidebar/90 px-5 backdrop-blur-md sm:px-8 md:px-12">
        <Link
          href="/"
          onClick={() => setOpenOn(null)}
          className="font-fraunces text-lg font-medium tracking-wide cursor-none"
        >
          Dyllen Owens
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpenOn(open ? null : pathname)}
          className="-mr-2 inline-flex items-center gap-2 p-2 font-mono text-[10px] font-medium uppercase tracking-[1.4px] text-muted cursor-none transition-colors hover:text-accent"
        >
          {open ? "Close" : "Menu"}
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div
          id="mobile-menu"
          className="fixed inset-x-0 top-14 bottom-0 flex flex-col overflow-y-auto bg-sidebar px-5 pt-10 pb-8 sm:px-8 md:px-12"
        >
          <div className="mb-10 flex items-end gap-5">
            <DistortionPortrait
              src="/self-portrait.svg"
              alt="Self portrait illustration"
              width={60}
              height={80}
              className="object-contain"
            />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Leader, Developer & Writer.
              <span className="block">Solving problems, sharing the process.</span>
            </p>
          </div>

          <nav aria-label="Primary" className="flex flex-col border-t border-edge">
            {NAV_ITEMS.map((item, i) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpenOn(null)}
                  aria-current={active ? "page" : undefined}
                  className="flex items-baseline gap-5 border-b border-edge py-4 cursor-none"
                >
                  <span className="font-mono text-[10px] font-medium tracking-[1.4px] text-muted">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={cn(
                      "font-fraunces text-[34px] font-light leading-none tracking-[-0.02em]",
                      active && "font-fraunces-italic italic font-normal text-accent",
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="flex-1" />

          <div className="mt-10 flex items-center justify-between font-mono text-[11px] tracking-[0.2px] text-muted-foreground">
            <span>MMXXVI</span>
            <ThemeToggle />
          </div>
        </div>
      )}
    </header>
  );
}
