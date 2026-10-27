"use client";

// The project editor: PostEditor's patterns (autosave, conflict detection,
// publish checks, history, photos) with a project's fields and a cover image
// chosen from the project's own photos.
import { format } from "date-fns";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  checkProjectAction,
  deleteProjectAction,
  previewProjectAction,
  projectHistoryAction,
  publishProjectAction,
  removeProjectPhotoAction,
  restoreProjectAction,
  saveProjectAction,
  unpublishProjectAction,
} from "@/app/admin/(app)/projects/actions";
import { cn } from "@/lib/utils";
import ArticleHtml from "@/components/ArticleHtml";
import { slugify } from "@/lib/cms/validate";
import type { ProjectCheckResult, ProjectInput } from "@/lib/cms/validate-project";
import { buttonDanger, buttonPrimary, buttonQuiet, buttonSecondary, input as inputClass, label } from "../ui";
import { ChartDialog } from "./ChartDialog";
import { HistoryDialog, type HistoryEntry } from "./HistoryDialog";
import { MarkdownField } from "./MarkdownField";
import { RichEditor, type BodyEditorHandle } from "./RichEditor";
import { CategorySelect, TagPicker, type TermOption } from "./TermPicker";
import { PhotoTray } from "./PhotoTray";
import { photoSrc, uploadPhoto, type EditorPhoto } from "./upload";

interface Props {
  id: string;
  initial: ProjectInput;
  initialPreview: string;
  updatedAt: string;
  state: "draft" | "published";
  publishedSlug: string | null;
  everPublished: boolean;
  unpublishedChanges: boolean;
  photos: EditorPhoto[];
  permissions: { edit: boolean; publish: boolean; unpublish: boolean; restore: boolean; delete: boolean };
  categories: TermOption[];
  technologies: TermOption[];
  /** Editors and writers can create categories from the editor. */
  canManageTaxonomy: boolean;
}

type SaveStatus = "saved" | "saving" | "error" | "conflict";
type TextField = "role" | "projectStatus" | "platform" | "liveUrl" | "sourceUrl";

const AUTOSAVE_DELAY = 1500;
const PREVIEW_DELAY = 400;
const fieldLabel = `${label} mb-1.5 block`;
const optional = <span className="normal-case tracking-normal">(optional)</span>;
const serialize = (input: ProjectInput) => JSON.stringify(input);
/** A cover that's one of the project's photos is stored by file name; anything else is an older URL. */
const isPhotoName = (value: string) => !/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(value);

export function ProjectEditor(props: Props) {
  const { id, permissions } = props;
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
  const [techOptions, setTechOptions] = useState(props.technologies);
  const addOption = (set: typeof setCategories) => (term: TermOption) =>
    set((list) => (list.some((t) => t.id === term.id) ? list : [...list, term].sort((a, b) => a.name.localeCompare(b.name))));
  const [uploading, setUploading] = useState(0);
  const [checks, setChecks] = useState<ProjectCheckResult | null>(null);
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
  const coverInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"visual" | "markdown">("visual");
  const [showPreview, setShowPreview] = useState(false);
  // The chart dialog: open with nothing to add a chart, with a block's position and source to edit it.
  const [chart, setChart] = useState<{ pos?: number; source?: string } | null>(null);
  const dirty = serialize(input) !== lastSaved;

  const update = (patch: Partial<ProjectInput>) =>
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
      const result = await saveProjectAction(id, snapshot, baseUpdatedAt.current, slugFollowsTitle);
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
      void previewProjectAction(id, input.body).then(setPreview);
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

  async function uploadFiles(files: File[], then: "insert" | "cover" | "none" = "insert") {
    for (const file of files) {
      setUploading((n) => n + 1);
      try {
        const photo = await uploadPhoto(id, file, "project");
        setPhotos((list) => [photo, ...list.filter((p) => p.name !== photo.name)]);
        if (then === "insert") body.current?.insertImage(photo.name, "");
        if (then === "cover") update({ image: photo.name });
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function removePhoto(photo: EditorPhoto) {
    const isCover = input.image === photo.name;
    const warning = isCover ? "It's the cover image, which will be cleared." : "Any references to it in the text will break.";
    if (!window.confirm(`Remove ${photo.name}? ${warning}`)) return;
    startBusy(async () => {
      const result = await removeProjectPhotoAction(id, photo.name);
      if (!result.ok) return void setMessage(result.error);
      setPhotos((list) => list.filter((p) => p.id !== photo.id));
      if (isCover) update({ image: null });
    });
  }

  function publish(confirmWarnings = false) {
    startBusy(async () => {
      if (!(await save())) return;
      const result = await checkProjectAction(id);
      if (result.errors.length || (result.warnings.length && !confirmWarnings)) {
        setChecks(result);
        return;
      }
      setChecks(null);
      const published = await publishProjectAction(id);
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
    if (!window.confirm("Take this project off the site? The draft and its history stay here.")) return;
    startBusy(async () => {
      const result = await unpublishProjectAction(id);
      if (!result.ok) return void setMessage(result.error);
      setLiveState("draft");
      setLiveSlug(null);
      setMessage("Unpublished. It's no longer on the site.");
    });
  }

  function remove() {
    if (!window.confirm("Delete this project permanently, with its history and photos? This can't be undone.")) return;
    startBusy(async () => {
      const result = await deleteProjectAction(id);
      if (result && !result.ok) setMessage(result.error);
    });
  }

  function openHistory() {
    setHistoryOpen(true);
    setHistory(null);
    startBusy(async () => {
      await save();
      const result = await projectHistoryAction(id);
      if (result.ok) setHistory(result.revisions);
      else setMessage(result.error);
    });
  }

  function restoreVersion(entry: HistoryEntry) {
    startBusy(async () => {
      if (!(await save())) return;
      const result = await restoreProjectAction(id, entry.id);
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
  const cover = input.image ? photos.find((p) => p.name === input.image) : undefined;
  const coverIsUrl = Boolean(input.image && !isPhotoName(input.image));
  const coverSrc = cover ? photoSrc(cover) : coverIsUrl ? input.image! : null;
  const categoryName = categories.find((c) => c.id === input.categoryId)?.name;
  const techNames = input.technologyIds.flatMap((tid) => techOptions.find((t) => t.id === tid)?.name ?? []);
  const year = input.launchDate?.slice(0, 4);

  const textInput = (field: TextField, text: string, placeholder?: string, type = "text") => (
    <div>
      <label htmlFor={field} className={fieldLabel}>
        {text} {optional}
      </label>
      <input
        id={field}
        type={type}
        value={input[field] ?? ""}
        placeholder={placeholder}
        onChange={(e) => update({ [field]: e.target.value } as Partial<ProjectInput>)}
        className={inputClass}
      />
    </div>
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="sticky top-0 z-10 -mx-5 mb-8 flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-edge bg-background/95 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8 md:-mx-12 md:px-12 lg:-mx-16 lg:px-16">
        <Link href="/admin/projects/" className={buttonQuiet}>
          ← Projects
        </Link>
        <span className={cn(label, liveState === "published" ? "text-accent" : "")}>
          {liveState === "published" ? (edited ? "Live · unpublished edits" : "Live") : "Draft"}
        </span>
        <span className={cn(label, status === "error" || status === "conflict" ? "text-red-600 dark:text-red-400" : "")} aria-live="polite">
          {editable ? statusText : "View only"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2">
          {liveSlug && (
            <a href={`/projects/${liveSlug}/`} target="_blank" rel="noreferrer" className={buttonQuiet}>
              View live ↗
            </a>
          )}
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
          You can read this project, but your role can&apos;t edit it{props.everPublished ? " now that it's been published" : ""}.
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
              placeholder="Project name"
              className="w-full bg-transparent font-fraunces text-[34px] sm:text-[40px] font-light tracking-[-0.03em] leading-tight outline-none placeholder:text-edge"
            />
            <textarea
              aria-label="Description"
              value={input.description}
              onChange={(e) => update({ description: e.target.value })}
              rows={2}
              placeholder="Description: one or two sentences for the page's dek, the /projects list, and search results"
              className="mt-2 w-full resize-none bg-transparent font-fraunces-italic italic font-light text-lg leading-snug text-muted outline-none placeholder:text-edge"
            />
            <div
              className={cn(
                label,
                "text-right",
                input.description && (input.description.length < 70 || input.description.length > 170) && "text-accent",
              )}
            >
              {input.description.length} / 70–170
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="slug" className={fieldLabel}>
                URL
              </label>
              <div className="flex items-center border border-edge focus-within:border-foreground">
                <span className="pl-3 font-mono text-xs text-muted">/projects/</span>
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
                  Live at /projects/{liveSlug}/. Publishing moves it to the new URL, and links to the old one will break.
                </p>
              )}
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
                collection="projects"
                onChange={(categoryId) => update({ categoryId })}
                onCreated={addOption(setCategories)}
                onError={setMessage}
              />
            </div>
            {textInput("role", "Role", "Design, engineering")}
            <div className="sm:col-span-2">
              <label htmlFor="technologies" className={fieldLabel}>
                Technologies <span className="normal-case tracking-normal">(Enter or comma to add)</span>
              </label>
              <TagPicker
                id="technologies"
                value={input.technologyIds}
                options={techOptions}
                disabled={!editable}
                collection="projects"
                prefix=""
                placeholder="Add technologies…"
                onChange={(technologyIds) => update({ technologyIds })}
                onCreated={addOption(setTechOptions)}
                onError={setMessage}
              />
            </div>
            {textInput("projectStatus", "Status", "Shipped · v1.3")}
            {textInput("platform", "Platform", "Web")}
            <div>
              <label htmlFor="launchDate" className={fieldLabel}>
                Launch date {optional}
              </label>
              <input
                id="launchDate"
                type="date"
                value={input.launchDate ?? ""}
                onChange={(e) => update({ launchDate: e.target.value || null })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="updated" className={fieldLabel}>
                Updated {optional}
              </label>
              <input
                id="updated"
                type="date"
                value={input.updated ?? ""}
                onChange={(e) => update({ updated: e.target.value || null })}
                className={inputClass}
              />
            </div>
            {textInput("liveUrl", "Live URL", "https://…", "url")}
            {textInput("sourceUrl", "Source URL", "https://github.com/…", "url")}
            <div className="sm:col-span-2">
              <label htmlFor="purpose" className={fieldLabel}>
                Purpose {optional}
              </label>
              <textarea
                id="purpose"
                rows={2}
                value={input.purpose}
                onChange={(e) => update({ purpose: e.target.value })}
                placeholder="Why it exists, in a sentence."
                className={`${inputClass} resize-y`}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="challenge" className={fieldLabel}>
                Challenge {optional}
              </label>
              <textarea
                id="challenge"
                rows={2}
                value={input.challenge}
                onChange={(e) => update({ challenge: e.target.value })}
                placeholder="The hardest part, in a sentence."
                className={`${inputClass} resize-y`}
              />
            </div>
          </div>

          {/* Cover image: one of the project's photos */}
          <section aria-labelledby="cover-heading">
            <div className="flex items-baseline justify-between border-b border-edge pb-2.5">
              <h2 id="cover-heading" className={label}>
                Cover image
              </h2>
              <div className="flex gap-4">
                {input.image && (
                  <button type="button" className={buttonQuiet} onClick={() => update({ image: null })}>
                    No cover
                  </button>
                )}
                <button type="button" className={buttonQuiet} onClick={() => coverInput.current?.click()}>
                  {uploading ? `Uploading ${uploading}…` : "Upload cover"}
                </button>
              </div>
              <input
                ref={coverInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml"
                hidden
                onChange={(e) => {
                  void uploadFiles([...(e.target.files ?? [])].slice(0, 1), "cover");
                  e.target.value = "";
                }}
              />
            </div>
            <div className="grid gap-4 pt-3 sm:grid-cols-[200px_1fr]">
              <div className="relative aspect-[16/10] overflow-hidden border border-edge bg-gradient-to-br from-(--secondary) to-(--sidebar)">
                {coverSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element -- private CMS thumbnail
                  <img src={coverSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span className={`${label} absolute inset-0 flex items-center justify-center`}>No cover</span>
                )}
              </div>
              <div className="min-w-0 text-xs text-muted">
                {coverIsUrl ? (
                  <p>
                    Using an external image: <span className="break-all font-mono">{input.image}</span>. Choose one of this
                    project&apos;s photos to replace it.
                  </p>
                ) : input.image && !cover ? (
                  <p className="text-red-700 dark:text-red-400">“{input.image}” isn&apos;t uploaded to this project.</p>
                ) : (
                  <p>Shown at the top of the project page, in the 16:10 figure panel. Choose a photo or upload one.</p>
                )}
                {photos.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2" aria-label="Choose a cover">
                    {photos.map((photo) => (
                      <li key={photo.id}>
                        <button
                          type="button"
                          aria-pressed={input.image === photo.name}
                          title={photo.name}
                          onClick={() => update({ image: photo.name })}
                          className={cn(
                            "block h-12 w-[76px] overflow-hidden border-2 transition-colors",
                            input.image === photo.name ? "border-accent" : "border-transparent hover:border-edge",
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- private CMS thumbnail */}
                          <img src={photoSrc(photo)} alt={`Use ${photo.name} as the cover`} className="h-full w-full object-cover" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

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
                onAddChart={editable ? () => setChart({}) : undefined}
                onEditChart={(pos, source) => setChart({ pos, source })}
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
            onUpload={(files) => void uploadFiles(files, "none")}
            onInsert={(photo, placement) => body.current?.insertImage(photo.name, placement)}
            onRemove={removePhoto}
          />
        </fieldset>

        {/* Site preview: the site's own renderer and project page styles */}
        <div className={cn("min-w-0", tab !== "preview" && "hidden", showPreview && "lg:block")}>
          <div className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:pr-2">
            <div className={`${label} mb-6`}>Preview</div>
            <article className="max-w-[680px]">
              <div className={`${label} mb-5 flex gap-4`}>
                {year && <span>{year}</span>}
                {categoryName && <span>{categoryName}</span>}
              </div>
              <h1 className="font-fraunces font-light text-[40px] sm:text-[52px] tracking-[-0.035em] leading-[0.95] mb-4">
                {input.title || "Untitled"}
              </h1>
              {input.description && (
                <p className="font-fraunces-italic italic font-light text-lg leading-snug text-muted mb-8">{input.description}</p>
              )}
              <div className="relative mb-8 aspect-[16/10] overflow-hidden border border-edge bg-gradient-to-br from-(--secondary) to-(--sidebar)">
                {coverSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element -- private CMS preview
                  <img src={coverSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-6 flex items-center justify-center font-fraunces font-light text-[28px] text-muted/40">
                    {input.title || "Untitled"}
                  </div>
                )}
              </div>
              {(input.role || input.projectStatus || input.platform || techNames.length > 0) && (
                <dl className="mb-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-edge py-6">
                  {(
                    [
                      ["Role", input.role],
                      ["Year", year],
                      ["Status", input.projectStatus],
                      ["Platform", input.platform],
                    ] as const
                  )
                    .filter(([, value]) => value)
                    .map(([key, value]) => (
                      <div key={key}>
                        <dt className={`${label} mb-1.5`}>{key}</dt>
                        <dd className="text-[15px]">{value}</dd>
                      </div>
                    ))}
                  {techNames.length > 0 && (
                    <div className="col-span-full">
                      <dt className={`${label} mb-1.5`}>Stack</dt>
                      <dd className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
                        {techNames.map((name) => (
                          <span key={name}>{name}</span>
                        ))}
                      </dd>
                    </div>
                  )}
                </dl>
              )}
              <ArticleHtml className="prose prose-sections" html={preview} />
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

      <ChartDialog
        open={chart !== null}
        initial={chart?.source}
        onCancel={() => {
          setChart(null);
          body.current?.focus();
        }}
        onSave={(source) => {
          if (chart?.pos !== undefined) body.current?.replaceChart(chart.pos, source);
          else body.current?.insertChart(source);
          setChart(null);
        }}
      />
    </div>
  );
}
