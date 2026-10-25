// Shared CMS styling, taken from the public site so the admin reads as part
// of owinz.io: mono uppercase labels, Fraunces headings, hairline rules.
import { cn } from "@/lib/utils";

export const buttonPrimary =
  "inline-flex items-center justify-center gap-2 py-3 px-5 bg-foreground text-background text-sm leading-3 transition-all ring-0 hover:ring-4 ring-accent ring-inset disabled:opacity-50 disabled:hover:ring-0";
export const buttonSecondary =
  "inline-flex items-center justify-center gap-2 py-3 px-5 bg-background text-sm leading-3 border border-edge transition-colors hover:border-foreground disabled:opacity-50";
export const buttonQuiet =
  "font-mono font-medium uppercase text-[10px] tracking-[1.4px] text-muted transition-colors hover:text-accent disabled:opacity-50";
export const buttonDanger =
  "font-mono font-medium uppercase text-[10px] tracking-[1.4px] text-muted transition-colors hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50";
export const label = "font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px]";
export const input =
  "w-full bg-background border border-edge px-3 py-2.5 text-sm outline-none transition-colors focus:border-foreground";

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-10 sm:mb-12">
      <div className={cn(label, "mb-5")}>{eyebrow}</div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-fraunces font-light text-[40px] sm:text-[52px] tracking-[-0.03em] leading-[1.02]">
          {title}
        </h1>
        {children}
      </div>
    </header>
  );
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 pb-3.5 mb-1 border-b border-edge">
      <h2 className="font-fraunces-italic italic font-medium text-[22px] tracking-[-0.22px]">{children}</h2>
      {aside && <div className={label}>{aside}</div>}
    </div>
  );
}

export function StateBadge({ state }: { state: "draft" | "published" }) {
  return (
    <span
      className={cn(
        "inline-block font-mono font-medium uppercase text-[9px] tracking-[1.2px] px-1.5 py-0.5 border",
        state === "published" ? "border-accent/40 text-accent" : "border-edge text-muted",
      )}
    >
      {state === "published" ? "Live" : "Draft"}
    </span>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-red-700 dark:text-red-400 mt-3">
      {message}
    </p>
  );
}
