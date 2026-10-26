"use client";

import { useState, useTransition } from "react";
import {
  createTermAction,
  deleteTermAction,
  mergeTagsAction,
  reorderCategoriesAction,
  updateTermAction,
  type TermResult,
} from "@/app/admin/(app)/taxonomy/actions";
import type { Collection } from "@/lib/content/terms";
import { cn } from "@/lib/utils";
import { Select } from "./Select";
import { buttonDanger, buttonPrimary, buttonQuiet, FormError, input, label, SectionTitle } from "./ui";

export interface ManagedTerm {
  id: string;
  name: string;
  slug: string;
  description: string;
  drafts: number;
  live: number;
}

function usage(t: ManagedTerm) {
  return `${t.live} live · ${t.drafts} draft${t.drafts === 1 ? "" : "s"}`;
}

/** Wording per collection: projects' tags are their technologies. */
const COPY = {
  writing: {
    tags: "Tags",
    tag: "tag",
    prefix: "#",
    items: "posts",
    categoryPath: "/writing/category",
    tagPath: "/writing/tag",
    index: "archive",
    describe: (name: string) => `Essays on ${name.toLowerCase()}…`,
  },
  projects: {
    tags: "Technologies",
    tag: "technology",
    prefix: "",
    items: "projects",
    categoryPath: "/projects/category",
    tagPath: "/projects/technology",
    index: "/projects page",
    describe: (name: string) => `Projects in ${name.toLowerCase()}…`,
  },
} as const;

export function TaxonomyManager({
  categories,
  tags,
  collection = "writing",
}: {
  categories: ManagedTerm[];
  tags: ManagedTerm[];
  collection?: Collection;
}) {
  const copy = COPY[collection];
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<TermResult>) =>
    start(async () => {
      const result = await fn();
      setError(result.ok ? null : result.error);
    });

  function move(index: number, by: -1 | 1) {
    const ids = categories.map((c) => c.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + by, 0, moved);
    run(() => reorderCategoriesAction(ids, collection));
  }

  return (
    <div className="grid gap-14">
      <FormError message={error} />

      <section>
        <SectionTitle aside={`${categories.length}`}>Categories</SectionTitle>
        <p className="py-3 text-sm text-muted leading-relaxed">
          Each category with live {copy.items} gets a page at {copy.categoryPath}/&lt;url&gt;/ and a filter on the{" "}
          {copy.index}, in this order. The description is that page&apos;s intro and its description in search results.
        </p>
        <ul>
          {categories.map((category, i) => (
            <CategoryRow
              key={category.id}
              category={category}
              first={i === 0}
              last={i === categories.length - 1}
              disabled={pending}
              onMove={(by) => move(i, by)}
              run={run}
              copy={copy}
            />
          ))}
        </ul>
        <AddTerm kind="category" collection={collection} disabled={pending} run={run} />
      </section>

      <section>
        <SectionTitle aside={`${tags.length}`}>{copy.tags}</SectionTitle>
        <p className="py-3 text-sm text-muted leading-relaxed">
          {copy.tags} link to {copy.tagPath}/&lt;url&gt;/ (kept out of search results). Merge near-duplicates instead of
          deleting: every {copy.items.slice(0, -1)} and saved version moves to the {copy.tag} you keep.
        </p>
        <ul>
          {tags.map((tag) => (
            <TagRow key={tag.id} tag={tag} others={tags.filter((t) => t.id !== tag.id)} disabled={pending} run={run} copy={copy} />
          ))}
        </ul>
        <AddTerm kind="tag" collection={collection} placeholder={`New ${copy.tag}`} disabled={pending} run={run} />
      </section>
    </div>
  );
}

type Run = (fn: () => Promise<TermResult>) => void;
type Copy = (typeof COPY)[Collection];

function CategoryRow({
  category,
  first,
  last,
  disabled,
  onMove,
  run,
  copy,
}: {
  category: ManagedTerm;
  first: boolean;
  last: boolean;
  disabled: boolean;
  onMove(by: -1 | 1): void;
  run: Run;
  copy: Copy;
}) {
  const [name, setName] = useState(category.name);
  const [slug, setSlug] = useState(category.slug);
  const [description, setDescription] = useState(category.description);
  const changed = name !== category.name || slug !== category.slug || description !== category.description;
  const used = category.drafts + category.live > 0;

  return (
    <li className="grid gap-3 border-b border-edge py-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[180px] flex-1">
          <span className={`${label} mb-1 block`}>Name</span>
          <input className={input} value={name} disabled={disabled} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="min-w-[180px] flex-1">
          <span className={`${label} mb-1 block`}>URL</span>
          <input
            className={`${input} font-mono`}
            value={slug}
            disabled={disabled}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
          />
        </label>
        <div className="flex items-center gap-1 pb-2">
          <button type="button" aria-label="Move up" disabled={disabled || first} className={buttonQuiet} onClick={() => onMove(-1)}>
            ↑
          </button>
          <button type="button" aria-label="Move down" disabled={disabled || last} className={buttonQuiet} onClick={() => onMove(1)}>
            ↓
          </button>
        </div>
      </div>
      <label>
        <span className={`${label} mb-1 block`}>Description</span>
        <textarea
          className={`${input} resize-y`}
          rows={2}
          value={description}
          disabled={disabled}
          placeholder={copy.describe(category.name)}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <span className={label}>{usage(category)}</span>
        {slug !== category.slug && category.live > 0 && (
          <span className="text-xs text-accent">
            Links to {copy.categoryPath}/{category.slug}/ will stop working.
          </span>
        )}
        <div className="ml-auto flex items-center gap-4">
          {changed && (
            <button
              type="button"
              disabled={disabled}
              className={buttonPrimary}
              onClick={() => run(() => updateTermAction(category.id, { name, slug, description }))}
            >
              Save
            </button>
          )}
          <button
            type="button"
            disabled={disabled || used}
            title={used ? `Move its ${copy.items} to another category first` : undefined}
            className={buttonDanger}
            onClick={() => window.confirm(`Delete “${category.name}”?`) && run(() => deleteTermAction(category.id))}
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

function TagRow({
  tag,
  others,
  disabled,
  run,
  copy,
}: {
  tag: ManagedTerm;
  others: ManagedTerm[];
  disabled: boolean;
  run: Run;
  copy: Copy;
}) {
  const [name, setName] = useState(tag.name);
  const [into, setInto] = useState("");
  const used = tag.drafts + tag.live > 0;

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-edge py-3">
      <input
        aria-label={`${copy.tag} name`}
        className={cn(input, "w-auto min-w-[160px] flex-1")}
        value={name}
        disabled={disabled}
        onChange={(e) => setName(e.target.value)}
      />
      <span className={cn(label, "w-32 shrink-0")}>{usage(tag)}</span>
      {name !== tag.name && (
        <button type="button" disabled={disabled} className={buttonQuiet} onClick={() => run(() => updateTermAction(tag.id, { name }))}>
          Rename
        </button>
      )}
      <Select
        aria-label="Merge into"
        className="w-44 shrink-0"
        value={into}
        disabled={disabled || others.length === 0}
        onChange={setInto}
        options={[
          { value: "", label: "Merge into…" },
          ...others.map((o) => ({ value: o.id, label: `${copy.prefix}${o.name}` })),
        ]}
      />
      {into && (
        <button
          type="button"
          disabled={disabled}
          className={buttonQuiet}
          onClick={() => {
            const target = others.find((o) => o.id === into);
            if (window.confirm(`Merge ${copy.prefix}${tag.name} into ${copy.prefix}${target?.name}? This can't be undone.`)) {
              run(() => mergeTagsAction(tag.id, into));
            }
          }}
        >
          Merge
        </button>
      )}
      <button
        type="button"
        disabled={disabled || used}
        title={used ? `Merge it into another ${copy.tag} instead` : undefined}
        className={buttonDanger}
        onClick={() => window.confirm(`Delete ${copy.prefix}${tag.name}?`) && run(() => deleteTermAction(tag.id))}
      >
        Delete
      </button>
    </li>
  );
}

function AddTerm({
  kind,
  collection,
  placeholder,
  disabled,
  run,
}: {
  kind: "category" | "tag";
  collection: Collection;
  placeholder?: string;
  disabled: boolean;
  run: Run;
}) {
  const [name, setName] = useState("");
  return (
    <form
      className="mt-4 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        run(async () => {
          const result = await createTermAction(kind, name, collection);
          if (result.ok) setName("");
          return result;
        });
      }}
    >
      <input
        className={`${input} flex-1`}
        value={name}
        disabled={disabled}
        placeholder={placeholder ?? (kind === "category" ? "New category" : "New tag")}
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" disabled={disabled || !name.trim()} className={buttonPrimary}>
        Add
      </button>
    </form>
  );
}
