import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

// Pulsing status dot + label, toggled by SITE.available.
export function AvailabilityBadge({
  label = "Available for new work",
  className,
  labelClassName,
}: {
  label?: string;
  className?: string;
  labelClassName?: string;
}) {
  if (!SITE.available) return null;
  return (
    <span
      className={cn(
        "flex items-center font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px]",
        className,
      )}
    >
      <span className="relative flex size-1.75 mr-2">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-accent opacity-0 motion-safe:animate-pulse-ring"
        />
        <span className="relative size-1.75 rounded-full bg-accent" />
      </span>
      <span className={labelClassName}>{label}</span>
    </span>
  );
}
