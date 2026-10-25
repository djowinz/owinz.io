"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function AdminNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/admin/" ? pathname === "/admin" || pathname === "/admin/" : pathname.startsWith(href.replace(/\/$/, ""));

  return (
    <nav aria-label="CMS" className="flex gap-5 lg:flex-col lg:gap-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(item.href) ? "page" : undefined}
          className={cn(
            "text-sm font-medium tracking-wide py-1 transition-colors",
            isActive(item.href)
              ? "text-accent font-fraunces font-semibold italic"
              : "text-muted-foreground hover:text-accent",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
