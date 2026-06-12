"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { DistortionPortrait } from "@/components/DistortionPortrait";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/writing", label: "Writing" },
  { href: "/projects", label: "Projects" },
  { href: "/talks", label: "Talks" },
  { href: "/contact", label: "Contact" },
];

function isActive(pathname: string, href: string): boolean {
  const current = pathname.replace(/\/+$/, "") || "/";
  if (href === "/") return current === "/";
  return current === href || current.startsWith(`${href}/`);
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="absolute top-0 left-0 bottom-0 right-0 flex flex-col p-8">
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
        <h1 className="text-[22px] font-medium font-fraunces tracking-wide text-sidebar-foreground mb-2">
          Dyllen Owens
        </h1>

        {/* Blurb */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          Leader, Developer & Writer.
          <span className="block">Solving problems, sharing the process.</span>
        </p>
      </div>

      {/* Divider */}
      <div className="w-12 h-px bg-border mb-6" />

      {/* Navigation */}
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
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

      {/* Footer */}
      <div className="w-full flex items-center justify-between font-mono text-[11px] tracking-[0.2px] text-muted-foreground">
        <span>MMXXVI</span>
        <span>◐</span>
      </div>
    </div>
  );
}
