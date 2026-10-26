"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  /** Plain text for type-ahead when the label isn't a string. */
  text?: string;
}

/**
 * A listbox in the site's style, in place of the native <select> (whose
 * popup can't be styled). Keyboard: arrows, Home/End, Enter/Space, Escape,
 * and type-ahead. With `name`, the value is posted with the surrounding form.
 */
export function Select({
  id,
  name,
  value,
  options,
  placeholder,
  disabled,
  className,
  "aria-label": ariaLabel,
  onChange,
}: {
  id?: string;
  name?: string;
  value: string;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  onChange(value: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [upward, setUpward] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();
  const selected = options.find((o) => o.value === value);
  const text = (o: SelectOption) => (o.text ?? (typeof o.label === "string" ? o.label : "")).toLowerCase();

  function show() {
    if (disabled) return;
    const box = trigger.current?.getBoundingClientRect();
    setUpward(!!box && window.innerHeight - box.bottom < 280 && box.top > window.innerHeight - box.bottom);
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function close(refocus = true) {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }

  function choose(index: number) {
    const option = options[index];
    close();
    if (option && option.value !== value) onChange(option.value);
  }

  useLayoutEffect(() => {
    if (open) list.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function onListKey(e: React.KeyboardEvent) {
    const last = options.length - 1;
    const keys: Record<string, () => void> = {
      ArrowDown: () => setActive((i) => Math.min(last, i + 1)),
      ArrowUp: () => setActive((i) => Math.max(0, i - 1)),
      Home: () => setActive(0),
      End: () => setActive(last),
      Enter: () => choose(active),
      " ": () => choose(active),
      Escape: () => close(),
      Tab: () => close(),
    };
    if (keys[e.key]) {
      if (e.key !== "Tab") e.preventDefault();
      keys[e.key]();
    } else if (e.key.length === 1) {
      const now = e.timeStamp;
      typed.current = { text: (now - typed.current.at < 600 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const match = options.findIndex((o) => text(o).startsWith(typed.current.text));
      if (match >= 0) setActive(match);
    }
  }

  return (
    <div ref={root} className={cn("relative", className)}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={trigger}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
            e.preventDefault();
            show();
          }
        }}
        className={cn(
          "flex w-full items-center justify-between gap-3 border border-edge bg-background py-2.5 pl-3 pr-3 text-left text-sm outline-none transition-colors",
          "hover:border-foreground/40 focus-visible:border-foreground disabled:opacity-50 disabled:hover:border-edge",
          open && "border-foreground",
        )}
      >
        <span className={cn("truncate", !selected?.value && "text-muted")}>{selected?.label ?? placeholder}</span>
        <ChevronDown
          aria-hidden
          className={cn("size-3.5 shrink-0 text-muted transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onListKey}
          className={cn(
            "absolute left-0 z-30 max-h-72 min-w-full overflow-auto border border-edge bg-background py-1 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.25)] outline-none",
            upward ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              data-index={i}
              role="option"
              aria-selected={o.value === value}
              onPointerMove={() => setActive(i)}
              onClick={() => choose(i)}
              className={cn(
                "flex cursor-default items-center justify-between gap-6 whitespace-nowrap px-3 py-2 text-sm",
                i === active && "bg-accent/10",
                !o.value ? "text-muted" : o.value === value && "text-accent",
              )}
            >
              {o.label}
              {o.value === value && o.value && <Check aria-hidden className="size-3.5 shrink-0" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
