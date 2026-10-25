"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  checkAction,
  deletePostAction,
  historyAction,
  previewAction,
  publishAction,
  removePhotoAction,
  restoreAction,
  savePostAction,
  unpublishAction,
} from "@/app/admin/(app)/writing/actions";
import { cn } from "@/lib/utils";
import { slugify, type CheckResult, type PostInput } from "@/lib/cms/validate";
import { buttonDanger, buttonPrimary, buttonQuiet, buttonSecondary, input as inputClass, label } from "../ui";
import { HistoryDialog, type HistoryEntry } from "./HistoryDialog";
import { MarkdownField } from "./MarkdownField";
import { RichEditor, type BodyEditorHandle } from "./RichEditor";
import { CategorySelect, TagPicker, type TermOption } from "./TermPicker";
import { PhotoTray } from "./PhotoTray";
import { uploadPhoto, type EditorPhoto } from "./upload";

interface Props {
  id: string;
  initial: PostInput;
  initialPreview: string;
  updatedAt: string;
  state: "draft" | "published";
  publishedSlug: string | null;
  everPublished: boolean;
  unpublishedChanges: boolean;
  photos: EditorPhoto[];
  permissions: { edit: boolean; publish: boolean; unpublish: boolean; restore: boolean; delete: boolean };
  defaultByline: string;
  categories: TermOption[];
  tags: TermOption[];
  /** Editors and writers can create categories from the editor. */
  canManageTaxonomy: boolean;
}

type SaveStatus = "saved" | "saving" | "error" | "conflict";

const AUTOSAVE_DELAY = 1500;
const PREVIEW_DELAY = 400;
const fieldLabel = `${label} mb-1.5 block`;
const serialize = (input: PostInput) => JSON.stringify(input);

export function PostEditor(props: Props) {
  const { id, permissions, defaultByline } = props;
  const editable = permissions.edit;

  const [input, setInput] = useState(props.initial);
  const [lastSaved, setLastSaved] = useState(() => serialize(props.initial));
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [message, setMessage] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [liveState, setLiveState] = useState(props.state);
  const [liveSlug, setLiveSlug] = useState(props.publishedSlug);
  const [edited, setEdited] = useState(props.unpublishedChanges);
  const [preview, setPreview] = useState(props.initialPreview);
  const [photos, setPhotos] = useState(props.photos);
  const [categories, setCategories] = useState(props.categories);
  const [tagOptions, setTagOptions] = useState(props.tags);
  const addOption = (set: typeof setCategories) => (term: TermOption) =>
    set((list) => (list.some((t) => t.id === term.id) ? list : [...list, term].sort((a, b) => a.name.localeCompare(b.name))));
  const [uploading, setUploading] = useState(0);
  const [checks, setChecks] = useState<CheckResult | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [busy, startBusy] = useTransition();
  const [slugFollowsTitle, setSlugFollowsTitle] = useState(
    !props.everPublished && props.initial.slug === (slugify(props.initial.title) || props.initial.slug),
  );

  const baseUpdatedAt = useRef(props.updatedAt);
  const saving = useRef<Promise<boolean> | null>(null);
  const body = useRef<BodyEditorHandle>(null);
  const [mode, setMode] = useState<"visual" | "markdown">("visual");
  const [showPreview, setShowPreview] = useState(false);
  const dirty = serialize(input) !== lastSaved;

  const update = (patch: Partial<PostInput>) =>
    setInput((current) => {
      const next = { ...current, ...patch };
      if (slugFollowsTitle && patch.title !== undefined) next.slug = slugify(patch.title) || current.slug;
      return next;
    });

  /** Saves the draft if it changed; resolves to false if saving failed. */
  const save = useCallback(async (): Promise<boolean> => {
    if (!editable) return true;
    if (saving.current) await saving.current;
    const snapshot = input;
    if (serialize(snapshot) === lastSaved) return true;
    const run = (async () => {
      setStatus("saving");
      const result = await savePostAction(id, snapshot, baseUpdatedAt.current, slugFollowsTitle);
      if (!result.ok) {
        setStatus(result.conflict ? "conflict" : "error");
        setMessage(result.error);
        return false;
      }
      baseUpdatedAt.current = result.updatedAt;
      // The server may have picked a free URL (e.g. "-2") for a following slug.
      const saved = result.slug === snapshot.slug ? snapshot : { ...snapshot, slug: result.slug };
      if (saved !== snapshot) setInput((current) => (current.slug === snapshot.slug ? { ...current, slug: result.slug } : current));
      setLastSaved(serialize(saved));
      setSavedAt(new Date());
      setStatus("saved");
      setMessage(null);
      if (liveState === "published") setEdited(true);
      return true;
    })();
    saving.current = run;
    try {
      return await run;
    } finally {
      saving.current = null;
    }
  }, [editable, id, input, lastSaved, liveState, slugFollowsTitle]);

  // Autosave shortly after typing stops; only when something changed.
  useEffect(() => {
    if (!dirty || !editable || status === "conflict") return;
    const timer = setTimeout(() => void save(), AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [dirty, editable, input, save, status]);

  // Site preview with the site's own renderer, while it's open.
  const previewOpen = showPreview || tab === "preview";
  useEffect(() => {
    if (!previewOpen) return;
    const timer = setTimeout(() => {
      void previewAction(id, input.body).then(setPreview);
    }, PREVIEW_DELAY);
    return () => clearTimeout(timer);
  }, [id, input.body, photos, previewOpen]);

  // ⌘S saves now; leaving with unsaved changes asks first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (serialize(input) !== lastSaved) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [input, lastSaved, save]);

  async function uploadFiles(files: File[], insert = true) {
    for (const file of files) {
      setUploading((n) => n + 1);
      try {
        const photo = await uploadPhoto(id, file);
        setPhotos((list) => [photo, ...list.filter((p) => p.name !== photo.name)]);
        if (insert) body.current?.insertImage(photo.name, "");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function insertPhoto(photo: EditorPhoto, placement: "" | "left" | "right") {
    body.current?.insertImage(photo.name, placement);
  }

  function removePhoto(photo: EditorPhoto) {
    if (!window.confirm(`Remove ${photo.name}? Any references to it in the text will break.`)) return;
    startBusy(async () => {
      const result = await removePhotoAction(id, photo.name);
      if (result.ok) setPhotos((list) => list.filter((p) => p.id !== photo.id));
      else setMessage(result.error);
    });
  }

  function publish(confirmWarnings = false) {
    startBusy(async () => {
      if (!(await save())) return;
      const result = await checkAction(id);
      if (result.errors.length || (result.warnings.length && !confirmWarnings)) {
        setChecks(result);
        return;
      }
      setChecks(null);
      const published = await publishAction(id);
      if (!published.ok) return void setMessage(published.error);
      setLiveState("published");
      setLiveSlug(published.slug);
      setEdited(false);
      // Once live, the URL only changes when someone edits it on purpose.
      setSlugFollowsTitle(false);
      setMessage("Published. The site is updated.");
    });
  }

  function unpublish() {
    if (!window.confirm("Take this post off the site? The draft and its history stay here.")) return;
    startBusy(async () => {
      const result = await unpublishAction(id);
      if (!result.ok) return void setMessage(result.error);
      setLiveState("draft");
      setLiveSlug(null);
      setMessage("Unpublished. It's no longer on the site.");
    });
  }

  function remove() {
    if (!window.confirm("Delete this post permanently, with its history and photos? This can't be undone.")) return;
    startBusy(async () => {
      const result = await deletePostAction(id);
      if (result && !result.ok) setMessage(result.error);
    });
  }

  /** The saved draft, rendered exactly like the live article, in a new tab. */
  async function openPreview() {
    // Opened before saving, while the click still counts as a user gesture.
    const tab = window.open("about:blank", "_blank");
    if (!(await save())) {
      tab?.close();
      return;
    }
    const url = `/admin/preview/writing/${id}/`;
    if (tab) tab.location.href = url;
    else setMessage(`Your browser blocked the preview tab. Open ${url} instead.`);
  }

  /** Downloads the saved draft as Markdown with frontmatter. */
  function exportMarkdown() {
    startBusy(async () => {
      if (!(await save())) return;
      const link = document.createElement("a");
      link.href = `/api/cms/posts/${id}/markdown/`;
      link.download = `${input.slug || "post"}.md`;
      document.body.append(link);
      link.click();
      link.remove();
    });
  }

  function openHistory() {
    setHistoryOpen(true);
    setHistory(null);
    startBusy(async () => {
      await save();
      const result = await historyAction(id);
      if (result.ok) setHistory(result.revisions);
      else setMessage(result.error);
    });
  }

  function restoreVersion(entry: HistoryEntry) {
    startBusy(async () => {
      if (!(await save())) return;
      const result = await restoreAction(id, entry.id);
      if (!result.ok) return void setMessage(result.error);
      baseUpdatedAt.current = result.updatedAt;
      setInput(result.input);
      setLastSaved(serialize(result.input));
      setSlugFollowsTitle(false);
      setHistoryOpen(false);
      setMessage("Version restored into the draft. Publish to make it live.");
      if (liveState === "published") setEdited(true);
    });
  }

  const statusText =
    status === "saving"
      ? "Saving…"
      : status === "error" || status === "conflict"
        ? "Not saved"
        : dirty
          ? "Unsaved changes"
          : savedAt
            ? `Saved ${format(savedAt, "HH:mm")}`
            : "All changes saved";

  const urlChanged = liveSlug && input.slug !== liveSlug;

  return (
    <div>
      {/* Toolbar */}
      <div className="sticky top-0 z-10 -mx-5 mb-8 flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-edge bg-background/95 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8 md:-mx-12 md:px-12 lg:-mx-16 lg:px-16">
        <Link href="/admin/writing/" className={buttonQuiet}>
          ← Writing
        </Link>
        <span className={cn(label, liveState === "published" ? "text-accent" : "")}>
          {liveState === "published" ? (edited ? "Live · unpublished edits" : "Live") : "Draft"}
        </span>
        <span className={cn(label, status === "error" || status === "conflict" ? "text-red-600 dark:text-red-400" : "")} aria-live="polite">
          {editable ? statusText : "View only"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2">
          {liveSlug && (
            <a href={`/writing/${liveSlug}/`} target="_blank" rel="noreferrer" className={buttonQuiet}>
              View live ↗
            </a>
          )}
          <button type="button" className={buttonQuiet} onClick={() => void openPreview()}>
            Preview ↗
          </button>
          <button type="button" disabled={busy} className={buttonQuiet} onClick={exportMarkdown}>
            Export .md
          </button>
          <button type="button" className={buttonQuiet} onClick={openHistory}>
            History
          </button>
          {permissions.delete && (
            <button type="button" disabled={busy} className={buttonDanger} onClick={remove}>
              Delete
            </button>
          )}
          {permissions.unpublish && liveState === "published" && (
            <button type="button" disabled={busy} className={buttonSecondary} onClick={unpublish}>
              Unpublish
            </button>
          )}
          {permissions.publish && (
            <button
              type="button"
              disabled={busy || (liveState === "published" && !edited && !dirty)}
              className={buttonPrimary}
              onClick={() => publish()}
            >
              {liveState === "published" ? "Update live" : "Publish"}
            </button>
          )}
        </div>
      </div>

      {!editable && (
        <p className="mb-6 border-l-2 border-edge pl-4 text-sm text-muted">
          You can read this post, but your role can&apos;t edit it{props.everPublished ? " now that it's been published" : ""}.
        </p>
      )}
      {!permissions.publish && editable && (
        <p className="mb-6 border-l-2 border-edge pl-4 text-sm text-muted">
          Your changes are saved as a draft. A writer or editor publishes it.
        </p>
      )}
      {message && (
        <p role="status" className={cn("mb-6 border-l-2 pl-4 text-sm", status === "conflict" || status === "error" ? "border-red-500 text-red-700 dark:text-red-400" : "border-accent")}>
          {message}
          {status === "conflict" && (
            <button type="button" className={`${buttonQuiet} ml-3`} onClick={() => window.location.reload()}>
              Reload
            </button>
          )}
        </p>
      )}
      {checks && (
        <div className="mb-8 border border-edge p-5">
          {checks.errors.length > 0 && (
            <>
              <div className={`${label} mb-2 text-red-600 dark:text-red-400`}>Fix before publishing</div>
              <ul className="mb-4 list-disc pl-5 text-sm">
                {checks.errors.map((issue, i) => (
                  <li key={i}>{issue.message}</li>
                ))}
              </ul>
            </>
          )}
          {checks.warnings.length > 0 && (
            <>
              <div className={`${label} mb-2`}>Worth a look</div>
              <ul className="mb-4 list-disc pl-5 text-sm text-muted">
                {checks.warnings.map((issue, i) => (
                  <li key={i}>{issue.message}</li>
                ))}
              </ul>
            </>
          )}
          <div className="flex gap-3">
            {checks.errors.length === 0 && (
              <button type="button" disabled={busy} className={buttonPrimary} onClick={() => publish(true)}>
                Publish anyway
              </button>
            )}
            <button type="button" className={buttonSecondary} onClick={() => setChecks(null)}>
              Keep editing
            </button>
          </div>
        </div>
      )}

      {/* Write / preview tabs below lg */}
      <div className="mb-6 flex gap-5 lg:hidden" role="tablist">
        {(["write", "preview"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(label, tab === t && "text-accent")}
          >
            {t === "write" ? "Write" : "Preview"}
          </button>
        ))}
      </div>

      <div className={cn("grid gap-12", showPreview ? "lg:grid-cols-2" : "max-w-[820px]")}>
        <fieldset disabled={!editable} className={cn("min-w-0 space-y-6", tab !== "write" && "hidden lg:block")}>
          <div>
            <label htmlFor="title" className="sr-only">
              Title
            </label>
            <input
              id="title"
              value={input.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="Title"
              className="w-full bg-transparent font-fraunces text-[34px] sm:text-[40px] font-light tracking-[-0.03em] leading-tight outline-none placeholder:text-edge"
            />
            <textarea
              aria-label="Excerpt"
              value={input.excerpt}
              onChange={(e) => update({ excerpt: e.target.value })}
              rows={2}
              placeholder="Excerpt: one or two sentences for search results and the article's dek"
              className="mt-2 w-full resize-none bg-transparent font-fraunces-italic italic font-light text-lg leading-snug text-muted outline-none placeholder:text-edge"
            />
            <div className={cn(label, "text-right", input.excerpt && (input.excerpt.length < 70 || input.excerpt.length > 170) && "text-accent")}>
              {input.excerpt.length} / 70–170
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="slug" className={fieldLabel}>
                URL
              </label>
              <div className="flex items-center border border-edge focus-within:border-foreground">
                <span className="pl-3 font-mono text-xs text-muted">/writing/</span>
                <input
                  id="slug"
                  value={input.slug}
                  onChange={(e) => {
                    setSlugFollowsTitle(false);
                    update({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") });
                  }}
                  className="w-full bg-transparent px-1 py-2.5 font-mono text-sm outline-none"
                />
              </div>
              {urlChanged && (
                <p className="mt-1.5 text-xs text-accent">
                  Live at /writing/{liveSlug}/. Publishing moves it to the new URL, and links to the old one will break.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="date" className={fieldLabel}>
                Date
              </label>
              <input id="date" type="date" value={input.date} onChange={(e) => update({ date: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label htmlFor="updated" className={fieldLabel}>
                Updated <span className="normal-case tracking-normal">(optional)</span>
              </label>
              <input
                id="updated"
                type="date"
                value={input.updated ?? ""}
                onChange={(e) => update({ updated: e.target.value || null })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="category" className={fieldLabel}>
                Category
              </label>
              <CategorySelect
                id="category"
                value={input.categoryId}
                options={categories}
                canCreate={props.canManageTaxonomy}
                disabled={!editable}
                onChange={(categoryId) => update({ categoryId })}
                onCreated={addOption(setCategories)}
                onError={setMessage}
              />
            </div>
            <div>
              <label htmlFor="byline" className={fieldLabel}>
                Byline
              </label>
              <input
                id="byline"
                value={input.byline ?? ""}
                onChange={(e) => update({ byline: e.target.value })}
                placeholder={defaultByline}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="tags" className={fieldLabel}>
                Tags <span className="normal-case tracking-normal">(Enter or comma to add)</span>
              </label>
              <TagPicker
                id="tags"
                value={input.tagIds}
                options={tagOptions}
                disabled={!editable}
                onChange={(tagIds) => update({ tagIds })}
                onCreated={addOption(setTagOptions)}
                onError={setMessage}
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex gap-4" role="tablist" aria-label="Editor">
                {(["visual", "markdown"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => setMode(m)}
                    className={cn(label, "transition-colors hover:text-accent", mode === m && "text-accent")}
                  >
                    {m === "visual" ? "Visual" : "Markdown"}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setShowPreview((v) => !v)} className={cn(label, "hidden transition-colors hover:text-accent lg:inline", showPreview && "text-accent")}>
                {showPreview ? "Hide site preview" : "Site preview"}
              </button>
            </div>
            {mode === "visual" ? (
              <RichEditor
                ref={body}
                value={input.body}
                onChange={(value) => update({ body: value })}
                disabled={!editable}
                photos={photos}
                onFiles={(files) => uploadFiles(files)}
              />
            ) : (
              <MarkdownField
                ref={body}
                value={input.body}
                onChange={(value) => update({ body: value })}
                disabled={!editable}
                onFiles={(files) => uploadFiles(files)}
              />
            )}
          </div>

          <PhotoTray
            photos={photos}
            disabled={!editable || busy}
            uploading={uploading}
            onUpload={(files) => void uploadFiles(files, false)}
            onInsert={insertPhoto}
            onRemove={removePhoto}
          />
        </fieldset>

        {/* Site preview: the site's own renderer and article styles */}
        <div className={cn("min-w-0", tab !== "preview" && "hidden", showPreview && "lg:block")}>
          <div className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:pr-2">
            <div className={`${label} mb-6`}>Preview</div>
            <article className="max-w-[680px]">
              <div className={`${label} mb-5 flex gap-4`}>
                {input.categoryId && <span>{categories.find((c) => c.id === input.categoryId)?.name}</span>}
                <span>{input.date}</span>
              </div>
              <h1 className="font-fraunces font-light text-[40px] sm:text-[48px] tracking-[-0.03em] leading-[1.02] mb-4">
                {input.title || "Untitled"}
              </h1>
              {input.excerpt && (
                <p className="font-fraunces-italic italic font-light text-lg leading-snug text-muted mb-8">{input.excerpt}</p>
              )}
              <div className="mb-8 border-b border-edge pb-4 text-[13px]">{input.byline?.trim() || defaultByline}</div>
              <div className="prose" dangerouslySetInnerHTML={{ __html: preview }} />
            </article>
          </div>
        </div>
      </div>

      <HistoryDialog
        open={historyOpen}
        entries={history}
        canRestore={permissions.restore && editable}
        busy={busy}
        onRestore={restoreVersion}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
}
