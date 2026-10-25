"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  checkTalkAction,
  deleteTalkAction,
  publishTalkAction,
  saveTalkAction,
  unpublishTalkAction,
} from "@/app/admin/(app)/talks/actions";
import { isUpcomingTalk } from "@/lib/content/upcoming";
import {
  checkTalkForPublish,
  cleanTalkInput,
  LINK_LABELS,
  MAX_LINKS,
  type TalkCheckResult,
  type TalkInput,
  type TalkIssue,
  type UpcomingChoice,
} from "@/lib/cms/talk-validate";
import type { TalkPermissions } from "@/lib/cms/talks";
import { slugify } from "@/lib/cms/validate";
import { cn } from "@/lib/utils";
import { buttonDanger, buttonPrimary, buttonQuiet, buttonSecondary, input as inputClass, label } from "../ui";

interface Props {
  id: string;
  initial: TalkInput;
  updatedAt: string;
  state: "draft" | "published";
  permissions: TalkPermissions;
}

type SaveStatus = "saved" | "saving" | "error" | "conflict";

const AUTOSAVE_DELAY = 1500;
const fieldLabel = `${label} mb-1.5 block`;
const serialize = (input: TalkInput) => JSON.stringify(input);
const FORMATS = ["Talk", "Keynote", "Workshop", "Panel", "Lightning talk", "Podcast", "Livestream"];
const STATUSES = ["Confirmed", "Tentative", "Invited", "Sold out", "Cancelled"];
const UPCOMING_OPTIONS: { value: UpcomingChoice; label: string }[] = [
  { value: "auto", label: "By date" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
];

export function TalkEditor(props: Props) {
  const { id, permissions } = props;
  const editable = permissions.edit;

  const [input, setInput] = useState(props.initial);
  const [lastSaved, setLastSaved] = useState(() => serialize(props.initial));
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [message, setMessage] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [liveState, setLiveState] = useState(props.state);
  const [checks, setChecks] = useState<TalkCheckResult | null>(null);
  const [busy, startBusy] = useTransition();
  const [slugFollowsTitle, setSlugFollowsTitle] = useState(
    props.state === "draft" && props.initial.slug === (slugify(props.initial.title) || props.initial.slug),
  );

  const baseUpdatedAt = useRef(props.updatedAt);
  const saving = useRef<Promise<boolean> | null>(null);
  const live = liveState === "published";
  const dirty = serialize(input) !== lastSaved;

  // A live talk saves straight to the site, so it only saves once it passes
  // the publish checks; until then the problems are shown instead.
  const issues = useMemo(() => checkTalkForPublish(cleanTalkInput(input)), [input]);
  const blocked = live && issues.errors.length > 0;

  const update = (patch: Partial<TalkInput>) =>
    setInput((current) => {
      const next = { ...current, ...patch };
      if (slugFollowsTitle && patch.title !== undefined) next.slug = slugify(patch.title) || current.slug;
      return next;
    });

  const updateLink = (index: number, patch: Partial<TalkInput["links"][number]>) =>
    update({ links: input.links.map((link, i) => (i === index ? { ...link, ...patch } : link)) });

  const moveLink = (index: number, by: -1 | 1) => {
    const links = [...input.links];
    const [link] = links.splice(index, 1);
    links.splice(index + by, 0, link);
    update({ links });
  };

  /** Saves if something changed; resolves to false if saving failed. */
  const save = useCallback(async (): Promise<boolean> => {
    if (!editable) return true;
    if (saving.current) await saving.current;
    const snapshot = input;
    if (serialize(snapshot) === lastSaved) return true;
    const run = (async () => {
      setStatus("saving");
      const result = await saveTalkAction(id, snapshot, baseUpdatedAt.current, slugFollowsTitle);
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
      return true;
    })();
    saving.current = run;
    try {
      return await run;
    } finally {
      saving.current = null;
    }
  }, [editable, id, input, lastSaved, slugFollowsTitle]);

  // Autosave shortly after typing stops; only when something changed.
  useEffect(() => {
    if (!dirty || !editable || blocked || status === "conflict") return;
    const timer = setTimeout(() => void save(), AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [blocked, dirty, editable, input, save, status]);

  // ⌘S saves now; leaving with unsaved changes asks first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!blocked) void save();
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
  }, [blocked, input, lastSaved, save]);

  function publish(confirmWarnings = false) {
    startBusy(async () => {
      if (!(await save())) return;
      const result = await checkTalkAction(id);
      if (result.errors.length || (result.warnings.length && !confirmWarnings)) {
        setChecks(result);
        return;
      }
      setChecks(null);
      const published = await publishTalkAction(id);
      if (!published.ok) return void setMessage(published.error);
      baseUpdatedAt.current = published.updatedAt;
      setLiveState("published");
      // Once live, the URL only changes when someone edits it on purpose.
      setSlugFollowsTitle(false);
      setStatus("saved");
      setMessage("Published. It's on the talks page now.");
    });
  }

  function unpublish() {
    if (!window.confirm("Take this talk off the site? It stays here as a draft.")) return;
    startBusy(async () => {
      if (!blocked && !(await save())) return;
      const result = await unpublishTalkAction(id);
      if (!result.ok) return void setMessage(result.error);
      baseUpdatedAt.current = result.updatedAt;
      setLiveState("draft");
      setMessage("Unpublished. It's no longer on the talks page.");
    });
  }

  function remove() {
    if (!window.confirm("Delete this talk permanently? This can't be undone.")) return;
    startBusy(async () => {
      const result = await deleteTalkAction(id);
      if (result && !result.ok) setMessage(result.error);
    });
  }

  const statusText =
    status === "saving"
      ? "Saving…"
      : status === "error" || status === "conflict"
        ? "Not saved"
        : blocked && dirty
          ? "Not saved · fix the issues below"
          : dirty
            ? "Unsaved changes"
            : savedAt
              ? `Saved${live ? " to the live page" : ""} ${format(savedAt, "HH:mm")}`
              : "All changes saved";

  const savedSlug = (JSON.parse(lastSaved) as TalkInput).slug;
  const byDate = input.date ? isUpcomingTalk({ date: input.date }, new Date()) : null;
  const linkIssues = (index: number): TalkIssue[] => {
    const link = input.links[index];
    if (!link.label.trim() && !link.url.trim() && !live) return [];
    return [...issues.errors, ...issues.warnings].filter((issue) => issue.link === index);
  };
  const fieldErrors = (field: keyof TalkInput) =>
    live ? issues.errors.filter((issue) => issue.field === field && issue.link === undefined) : [];

  return (
    <div>
      {/* Toolbar */}
      <div className="sticky top-0 z-10 -mx-5 mb-8 flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-edge bg-background/95 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8 md:-mx-12 md:px-12 lg:-mx-16 lg:px-16">
        <Link href="/admin/talks/" className={buttonQuiet}>
          ← Talks
        </Link>
        <span className={cn(label, live && "text-accent")}>{live ? "Live" : "Draft"}</span>
        <span
          className={cn(label, (status === "error" || status === "conflict" || (blocked && dirty)) && "text-red-600 dark:text-red-400")}
          aria-live="polite"
        >
          {editable ? statusText : "View only"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2">
          {live && (
            <a href={`/talks/#${savedSlug}`} target="_blank" rel="noreferrer" className={buttonQuiet}>
              View live ↗
            </a>
          )}
          {permissions.delete && (
            <button type="button" disabled={busy} className={buttonDanger} onClick={remove}>
              Delete
            </button>
          )}
          {permissions.unpublish && live && (
            <button type="button" disabled={busy} className={buttonSecondary} onClick={unpublish}>
              Unpublish
            </button>
          )}
          {permissions.publish && !live && (
            <button type="button" disabled={busy} className={buttonPrimary} onClick={() => publish()}>
              Publish
            </button>
          )}
        </div>
      </div>

      {live && editable && (
        <p className="mb-6 border-l-2 border-accent pl-4 text-sm">
          <strong className="font-medium">This talk is live.</strong> Changes save straight to the talks page as you type.
          Talks have no drafts or version history, so there&apos;s nothing to publish and nothing to roll back to.
        </p>
      )}
      {!editable && (
        <p className="mb-6 border-l-2 border-edge pl-4 text-sm text-muted">
          You can read this talk, but your role can&apos;t edit it{live ? " now that it's published" : ""}.
        </p>
      )}
      {!permissions.publish && editable && (
        <p className="mb-6 border-l-2 border-edge pl-4 text-sm text-muted">
          Your changes are saved as a draft. A writer or editor publishes it.
        </p>
      )}
      {message && (
        <p
          role="status"
          className={cn(
            "mb-6 border-l-2 pl-4 text-sm",
            status === "conflict" || status === "error" ? "border-red-500 text-red-700 dark:text-red-400" : "border-accent",
          )}
        >
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

      <fieldset disabled={!editable} className="max-w-[720px] min-w-0 space-y-8">
        <div>
          <label htmlFor="title" className="sr-only">
            Title
          </label>
          <input
            id="title"
            value={input.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Talk title"
            className="w-full bg-transparent font-fraunces text-[34px] sm:text-[40px] font-light tracking-[-0.03em] leading-tight outline-none placeholder:text-edge"
          />
          <FieldErrors issues={fieldErrors("title")} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="slug" className={fieldLabel}>
              URL
            </label>
            <div className="flex items-center border border-edge focus-within:border-foreground">
              <span className="pl-3 font-mono text-xs text-muted">/talks/#</span>
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
            <p className="mt-1.5 text-xs text-muted">The talk&apos;s anchor on the talks page.</p>
            <FieldErrors issues={fieldErrors("slug")} />
          </div>
          <div>
            <label htmlFor="date" className={fieldLabel}>
              Date
            </label>
            <input id="date" type="date" required value={input.date} onChange={(e) => update({ date: e.target.value })} className={inputClass} />
            <FieldErrors issues={fieldErrors("date")} />
          </div>
          <div>
            <label htmlFor="venue" className={fieldLabel}>
              Venue <span className="normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="venue"
              value={input.venue}
              onChange={(e) => update({ venue: e.target.value })}
              placeholder="Conference or meetup, city"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="format" className={fieldLabel}>
              Format <span className="normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="format"
              list="talk-formats"
              value={input.format}
              onChange={(e) => update({ format: e.target.value })}
              placeholder="Keynote, 30 min talk…"
              className={inputClass}
            />
            <datalist id="talk-formats">
              {FORMATS.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
          <div>
            <label htmlFor="status" className={fieldLabel}>
              Status <span className="normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="status"
              list="talk-statuses"
              value={input.status}
              onChange={(e) => update({ status: e.target.value })}
              placeholder="Confirmed"
              className={inputClass}
            />
            <datalist id="talk-statuses">
              {STATUSES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div className="sm:col-span-2">
            <div id="upcoming-label" className={fieldLabel}>
              Show under
            </div>
            <div role="radiogroup" aria-labelledby="upcoming-label" className="inline-flex border border-edge">
              {UPCOMING_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={input.upcoming === option.value}
                  onClick={() => update({ upcoming: option.value })}
                  className={cn(
                    "px-4 py-2 text-sm transition-colors border-r border-edge last:border-r-0",
                    input.upcoming === option.value ? "bg-foreground text-background" : "hover:bg-accent/5",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {byDate === null
                ? "Pick a date first."
                : input.upcoming === "auto"
                  ? `By its date it's ${byDate ? "upcoming" : "past"}, and it moves to Past the day after.`
                  : `Always shown under ${input.upcoming === "upcoming" ? "Upcoming" : "Past"}, whatever the date (by date it would be ${byDate ? "upcoming" : "past"}).`}
            </p>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between border-b border-edge pb-2">
            <span className={label}>Links</span>
            <span className={label}>
              {input.links.length} / {MAX_LINKS}
            </span>
          </div>
          {input.links.length === 0 && (
            <p className="py-4 text-sm text-muted">Slides, a recording, or the event page. Links need https://.</p>
          )}
          <ol className="divide-y divide-edge">
            {input.links.map((link, i) => (
              <li key={i} className="py-3">
                <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[160px_1fr_auto] sm:items-center">
                  <input
                    aria-label={`Link ${i + 1} label`}
                    list="talk-link-labels"
                    value={link.label}
                    onChange={(e) => updateLink(i, { label: e.target.value })}
                    placeholder="Slides"
                    className={cn(inputClass, "col-span-2 sm:col-span-1")}
                  />
                  <input
                    aria-label={`Link ${i + 1} URL`}
                    type="url"
                    inputMode="url"
                    value={link.url}
                    onChange={(e) => updateLink(i, { url: e.target.value })}
                    placeholder="https://"
                    className={cn(inputClass, "font-mono text-xs")}
                  />
                  <div className="flex items-center gap-3 pl-1">
                    <button type="button" className={buttonQuiet} disabled={i === 0} onClick={() => moveLink(i, -1)} aria-label={`Move link ${i + 1} up`}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className={buttonQuiet}
                      disabled={i === input.links.length - 1}
                      onClick={() => moveLink(i, 1)}
                      aria-label={`Move link ${i + 1} down`}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className={buttonDanger}
                      onClick={() => update({ links: input.links.filter((_, j) => j !== i) })}
                      aria-label={`Remove link ${i + 1}`}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                {linkIssues(i).map((issue, j) => (
                  <p
                    key={j}
                    className={cn("mt-1.5 text-xs", issues.errors.includes(issue) ? "text-red-700 dark:text-red-400" : "text-accent")}
                  >
                    {issue.message.replace(/^Link \d+: /, "")}
                  </p>
                ))}
              </li>
            ))}
          </ol>
          <datalist id="talk-link-labels">
            {LINK_LABELS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
          <button
            type="button"
            className={cn(buttonSecondary, "mt-3")}
            disabled={input.links.length >= MAX_LINKS}
            onClick={() => update({ links: [...input.links, { label: "", url: "" }] })}
          >
            Add link
          </button>
        </div>
      </fieldset>
    </div>
  );
}

function FieldErrors({ issues }: { issues: TalkIssue[] }) {
  if (!issues.length) return null;
  return (
    <>
      {issues.map((issue, i) => (
        <p key={i} className="mt-1.5 text-xs text-red-700 dark:text-red-400">
          {issue.message}
        </p>
      ))}
    </>
  );
}
