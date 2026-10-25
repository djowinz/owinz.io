"use client";

import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

// The label and glyph swap via the `dark:` variant rather than
// `resolvedTheme`, so server and client markup match and nothing flashes
// before hydration.
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      className={cn(
        "inline-flex items-center gap-2 uppercase cursor-none transition-colors hover:text-accent",
        className,
      )}
    >
      <span className="dark:hidden">Light</span>
      <span className="hidden dark:inline">Dark</span>
      <span aria-hidden className="inline-block transition-transform duration-300 dark:rotate-180">
        ◐
      </span>
    </button>
  );
}
