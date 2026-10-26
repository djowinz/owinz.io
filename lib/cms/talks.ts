// Talks in the CMS: everything the talk editor does, with the permission
// check for each. Server actions (app/admin/(app)/talks) wrap these and
// refresh the site's cache when something live changes.
//
// Talks have no version history: the row is what the site shows, so saving
// a published talk updates the live page straight away.
import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { Db } from "../db";
import { talks, users, type TalkRow } from "../db/schema";
import { isUpcomingTalk } from "../content/upcoming";
import { assertCan, can, type Actor } from "./permissions";
import {
  checkTalkDraft,
  checkTalkForPublish,
  cleanTalkInput,
  upcomingChoice,
  upcomingValue,
  type TalkCheckResult,
  type TalkInput,
} from "./talk-validate";
import { slugify } from "./validate";

export class TalkError extends Error {}

/** Someone else saved the talk after this editor loaded it. */
export class TalkConflictError extends Error {
  constructor(public by: string | null) {
    super(`${by ?? "Someone"} saved this talk after you opened it. Reload to see their changes.`);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function talkInput(row: TalkRow): TalkInput {
  return {
    title: row.title,
    slug: row.slug,
    date: row.date,
    venue: row.venue ?? "",
    format: row.format ?? "",
    status: row.talkStatus ?? "",
    upcoming: upcomingChoice(row.upcoming),
    links: row.links.map((link) => ({ label: link.label, url: link.url })),
  };
}

/** The columns a (cleaned) input writes. */
function talkFields(input: TalkInput) {
  const opt = (value: string) => value || null;
  return {
    title: input.title,
    slug: input.slug,
    date: input.date,
    venue: opt(input.venue),
    format: opt(input.format),
    talkStatus: opt(input.status),
    upcoming: upcomingValue(input.upcoming),
    links: input.links,
  };
}

const sameInput = (a: TalkInput, b: TalkInput) => JSON.stringify(a) === JSON.stringify(b);

async function findTalk(db: Db, id: string): Promise<TalkRow> {
  if (!UUID.test(id)) throw new TalkError("This talk no longer exists.");
  const [row] = await db.select().from(talks).where(eq(talks.id, id));
  if (!row) throw new TalkError("This talk no longer exists.");
  return row;
}

async function uniqueSlug(db: Db, base: string, exceptId?: string): Promise<string> {
  const root = base || "untitled";
  for (let n = 1; ; n++) {
    const slug = n === 1 ? root : `${root}-${n}`;
    const taken = await db
      .select({ id: talks.id })
      .from(talks)
      .where(exceptId ? and(eq(talks.slug, slug), ne(talks.id, exceptId)) : eq(talks.slug, slug));
    if (taken.length === 0) return slug;
  }
}

export async function createTalk(db: Db, actor: Actor, title = ""): Promise<TalkRow> {
  assertCan(actor, "create");
  const slug = await uniqueSlug(db, slugify(title) || "untitled");
  const [row] = await db
    .insert(talks)
    .values({ slug, title: title.trim(), date: today(), createdBy: actor.id, updatedBy: actor.id })
    .returning();
  return row;
}

export interface TalkListItem {
  id: string;
  title: string;
  slug: string;
  state: "draft" | "published";
  date: string;
  venue: string | null;
  /** Forced by the override rather than the date. */
  forced: boolean;
  updatedAt: Date;
  updatedBy: string | null;
  canEdit: boolean;
}

/**
 * Every talk, drafts included, grouped as the site groups them: upcoming
 * soonest first, past most recent first.
 */
export async function listTalks(
  db: Db,
  actor: Actor,
  now: Date = new Date(),
): Promise<{ upcoming: TalkListItem[]; past: TalkListItem[] }> {
  const rows = await db
    .select({ row: talks, editor: users.name })
    .from(talks)
    .leftJoin(users, eq(users.id, talks.updatedBy))
    .orderBy(desc(talks.date), desc(talks.updatedAt));
  const items = rows.map(({ row, editor }) => ({
    upcoming: isUpcomingTalk(row, now),
    item: {
      id: row.id,
      title: row.title || "Untitled",
      slug: row.slug,
      state: row.state,
      date: row.date,
      venue: row.venue,
      forced: row.upcoming !== null,
      updatedAt: row.updatedAt,
      updatedBy: editor,
      canEdit: can(actor, "edit", row),
    } satisfies TalkListItem,
  }));
  return {
    upcoming: items.filter((i) => i.upcoming).map((i) => i.item).reverse(),
    past: items.filter((i) => !i.upcoming).map((i) => i.item),
  };
}

export interface TalkPermissions {
  edit: boolean;
  publish: boolean;
  unpublish: boolean;
  delete: boolean;
}

export interface TalkForEdit {
  talk: TalkRow;
  input: TalkInput;
  updatedBy: string | null;
  permissions: TalkPermissions;
}

export async function getTalkForEdit(db: Db, actor: Actor, id: string): Promise<TalkForEdit> {
  const talk = await findTalk(db, id);
  const [editor] = talk.updatedBy
    ? await db.select({ name: users.name }).from(users).where(eq(users.id, talk.updatedBy))
    : [];
  return {
    talk,
    input: talkInput(talk),
    updatedBy: editor?.name ?? null,
    permissions: {
      edit: can(actor, "edit", talk),
      publish: can(actor, "publish", talk),
      unpublish: can(actor, "unpublish", talk),
      delete: can(actor, "delete", talk),
    },
  };
}

export interface TalkSaveResult {
  talk: TalkRow;
  /** Something changed and was written. */
  changed: boolean;
  /** The saved talk is on the site, so the change is live. */
  live: boolean;
}

/**
 * Saves the talk. On a published talk this is the live page, so the save
 * must also pass the publish checks. `baseUpdatedAt` is when the editor last
 * loaded or saved; a newer save by someone else is a conflict, not an overwrite.
 */
export async function saveTalk(
  db: Db,
  actor: Actor,
  id: string,
  raw: TalkInput,
  baseUpdatedAt: Date,
  /** The URL is following the title (a new talk): take the next free one instead of failing. */
  { autoSlug = false, now = new Date() }: { autoSlug?: boolean; now?: Date } = {},
): Promise<TalkSaveResult> {
  const current = await findTalk(db, id);
  assertCan(actor, "edit", current);
  if (current.updatedAt.getTime() !== baseUpdatedAt.getTime() && current.updatedBy !== actor.id) {
    const [editor] = current.updatedBy
      ? await db.select({ name: users.name }).from(users).where(eq(users.id, current.updatedBy))
      : [];
    throw new TalkConflictError(editor?.name ?? null);
  }

  const input = cleanTalkInput(raw);
  const live = current.state === "published";
  const problems = live ? checkTalkForPublish(input, now).errors : checkTalkDraft(input);
  if (problems.length) {
    const first = problems[0].message;
    throw new TalkError(live ? `This talk is live, so it wasn't saved: ${first}` : first);
  }

  const free = await uniqueSlug(db, input.slug, id);
  if (free !== input.slug) {
    if (!autoSlug || live) throw new TalkError(`Another talk already uses the URL /talks/#${input.slug}.`);
    input.slug = free;
  }

  if (sameInput(input, talkInput(current))) return { talk: current, changed: false, live };
  const [talk] = await db
    .update(talks)
    .set({ ...talkFields(input), updatedBy: actor.id })
    .where(eq(talks.id, id))
    .returning();
  return { talk, changed: true, live };
}

export async function checkTalk(db: Db, id: string, now: Date = new Date()): Promise<TalkCheckResult> {
  return checkTalkForPublish(talkInput(await findTalk(db, id)), now);
}

/** Puts the saved talk on the site. */
export async function publishTalk(db: Db, actor: Actor, id: string, now: Date = new Date()): Promise<TalkRow> {
  const current = await findTalk(db, id);
  assertCan(actor, "publish", current);
  const { errors } = checkTalkForPublish(talkInput(current), now);
  if (errors.length) throw new TalkError(errors.map((e) => e.message).join(" "));
  const [talk] = await db
    .update(talks)
    .set({ state: "published", firstPublishedAt: sql`coalesce(${talks.firstPublishedAt}, now())`, updatedBy: actor.id })
    .where(eq(talks.id, id))
    .returning();
  return talk;
}

/** Takes the talk off the site; it stays here as a draft. */
export async function unpublishTalk(db: Db, actor: Actor, id: string): Promise<TalkRow> {
  const current = await findTalk(db, id);
  assertCan(actor, "unpublish", current);
  const [talk] = await db
    .update(talks)
    .set({ state: "draft", updatedBy: actor.id })
    .where(eq(talks.id, id))
    .returning();
  return talk;
}

/** Deletes the talk. Returns whether it was live (so the site needs refreshing). */
export async function deleteTalk(db: Db, actor: Actor, id: string): Promise<{ wasLive: boolean }> {
  const current = await findTalk(db, id);
  assertCan(actor, "delete", current);
  await db.delete(talks).where(eq(talks.id, id));
  return { wasLive: current.state === "published" };
}
