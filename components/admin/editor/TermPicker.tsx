"use client";

import { useId, useMemo, useState } from "react";
import { createTermAction } from "@/app/admin/(app)/taxonomy/actions";
import type { Collection } from "@/lib/content/terms";
import { cn } from "@/lib/utils";
import { input as inputClass } from "../ui";

export interface TermOption {
  id: string;
  name: string;
  slug: string;
}

const NEW = "__new__";

export function CategorySelect({
  id,
  value,
  options,
  canCreate,
  disabled,
  onChange,
  onCreated,
  onError,
  collection = "writing",
}: {
  id?: string;
  value: string | null;
  options: TermOption[];
  canCreate: boolean;
  disabled?: boolean;
  /** Which collection new categories belong to. */
  collection?: Collection;
  onChange(id: string | null): void;
  onCreated(term: TermOption): void;
  onError(message: string): void;
}) {
  const [busy, setBusy] = useState(false);

  async function create() {
    const name = window.prompt("New category name");
    if (!name?.trim()) return;
    setBusy(true);
    const result = await createTermAction("category", name, collection);
    setBusy(false);
    if (!result.ok) return onError(result.error);
    onCreated(result.term);
    onChange(result.term.id);
  }

  return (
    <select
      id={id}
      value={value ?? ""}
      disabled={disabled || busy}
      onChange={(e) => (e.target.value === NEW ? void create() : onChange(e.target.value || null))}
      className={inputClass}
    >
      <option value="">No category</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
      {canCreate && <option value={NEW}>＋ New category…</option>}
    </select>
  );
}

/** Tag chips with autocomplete; typing a new name creates the tag. */
export function TagPicker({
  id,
  value,
  options,
  disabled,
  onChange,
  onCreated,
  onError,
  collection = "writing",
  placeholder = "Add tags…",
  prefix = "#",
}: {
  id?: string;
  value: string[];
  options: TermOption[];
  disabled?: boolean;
  /** Which collection new tags belong to (projects' tags are its technologies). */
  collection?: Collection;
  placeholder?: string;
  /** Shown before each name, e.g. "#". */
  prefix?: string;
  onChange(ids: string[]): void;
  onCreated(term: TermOption): void;
  onError(message: string): void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const query = text.trim().toLowerCase();
  const suggestions = options
    .filter((o) => !value.includes(o.id) && (!query || o.name.toLowerCase().includes(query)))
    .slice(0, 8);

  async function add(name: string) {
    const clean = name.trim().replace(/^#/, "");
    if (!clean) return;
    const existing = options.find((o) => o.name.toLowerCase() === clean.toLowerCase());
    if (existing) {
      if (!value.includes(existing.id)) onChange([...value, existing.id]);
      setText("");
      return;
    }
    setBusy(true);
    const result = await createTermAction("tag", clean, collection);
    setBusy(false);
    if (!result.ok) return onError(result.error);
    onCreated(result.term);
    onChange([...value, result.term.id]);
    setText("");
  }

  return (
    <div className="relative">
      <div
        className={cn(
          "flex min-h-[42px] flex-wrap items-center gap-1.5 border border-edge bg-background px-2 py-1.5 focus-within:border-foreground",
          disabled && "opacity-60",
        )}
      >
        {value.map((tagId) => {
          const tag = byId.get(tagId);
          if (!tag) return null;
          return (
            <span key={tagId} className="inline-flex items-center gap-1 bg-accent/10 px-2 py-0.5 font-mono text-[11px] text-accent">
              {prefix}
              {tag.name}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remove ${tag.name}`}
                  onClick={() => onChange(value.filter((v) => v !== tagId))}
                  className="opacity-60 hover:opacity-100"
                >
                  ×
                </button>
              )}
            </span>
          );
        })}
        <input
          id={id}
          value={text}
          disabled={disabled || busy}
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          placeholder={value.length ? "" : placeholder}
          onChange={(e) => {
            const next = e.target.value;
            if (next.endsWith(",")) void add(next.slice(0, -1));
            else setText(next);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add(text);
            } else if (e.key === "Backspace" && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          className="min-w-[120px] flex-1 bg-transparent py-1 text-sm outline-none"
        />
      </div>
      {open && !disabled && (suggestions.length > 0 || query) && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-60 w-full overflow-auto border border-edge bg-background shadow-sm">
          {suggestions.map((o) => (
            <li key={o.id} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void add(o.name)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent/10"
              >
                {prefix}
                {o.name}
              </button>
            </li>
          ))}
          {query && !options.some((o) => o.name.toLowerCase() === query) && (
            <li role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void add(text)}
                className="block w-full px-3 py-2 text-left text-sm text-accent hover:bg-accent/10"
              >
                ＋ Create “{text.trim().replace(/^#/, "")}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
