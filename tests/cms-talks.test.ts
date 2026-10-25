import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../lib/db";
import { talks, users } from "../lib/db/schema";
import { publishedTalks } from "../lib/content/db";
import { isUpcomingTalk } from "../lib/content/upcoming";
import { ForbiddenError, type Actor } from "../lib/cms/permissions";
import {
  createTalk,
  deleteTalk,
  getTalkForEdit,
  listTalks,
  publishTalk,
  saveTalk,
  TalkConflictError,
  TalkError,
  talkInput,
  unpublishTalk,
} from "../lib/cms/talks";
import { checkTalkDraft, checkTalkForPublish, cleanTalkInput, type TalkInput } from "../lib/cms/talk-validate";
import { talkSchemas } from "../lib/schema";
import { testDb } from "./helpers/db";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await testDb());
});
afterAll(() => close());

const editor: Actor = { id: "editor", role: "editor" };
const writer: Actor = { id: "writer", role: "writer" };
const contributor: Actor = { id: "contrib", role: "contributor" };
const otherContributor: Actor = { id: "contrib-2", role: "contributor" };
const NOW = new Date(2026, 5, 15, 14, 30); // 15 June 2026, mid-afternoon

beforeEach(async () => {
  await db.execute(sql`truncate users, talks cascade`);
  for (const a of [editor, writer, contributor, otherContributor]) {
    await db.insert(users).values({ id: a.id, name: `${a.id} name`, email: `${a.id}@example.com`, role: a.role });
  }
});

const ready = (overrides: Partial<TalkInput> = {}): TalkInput => ({
  title: "Small software, quietly",
  slug: "small-software-quietly",
  date: "2026-09-10",
  venue: "Local Meetup, Portland",
  format: "30 min talk",
  status: "Confirmed",
  upcoming: "auto",
  links: [{ label: "Event page", url: "https://meetup.org/small-software" }],
  ...overrides,
});

async function saved(actor: Actor, overrides: Partial<TalkInput> = {}) {
  const created = await createTalk(db, actor);
  const { talk } = await saveTalk(db, actor, created.id, ready(overrides), created.updatedAt, { now: NOW });
  return talk;
}

describe("upcoming or past", () => {
  it("goes by date, keeping a talk upcoming through its own day", () => {
    expect(isUpcomingTalk({ date: "2026-06-16" }, NOW)).toBe(true);
    expect(isUpcomingTalk({ date: "2026-06-15" }, NOW)).toBe(true);
    expect(isUpcomingTalk({ date: "2026-06-14" }, NOW)).toBe(false);
    expect(isUpcomingTalk({ date: "not a date" }, NOW)).toBe(false);
  });

  it("lets the override win either way", () => {
    expect(isUpcomingTalk({ date: "2020-01-01", upcoming: true }, NOW)).toBe(true);
    expect(isUpcomingTalk({ date: "2099-01-01", upcoming: false }, NOW)).toBe(false);
    expect(isUpcomingTalk({ date: "2099-01-01", upcoming: null }, NOW)).toBe(true);
  });

  it("groups the CMS list like the site, drafts included", async () => {
    await saved(writer, { title: "Later", slug: "later", date: "2026-12-01" });
    await saved(writer, { title: "Sooner", slug: "sooner", date: "2026-07-01" });
    await saved(writer, { title: "Today", slug: "today", date: "2026-06-15" });
    await saved(writer, { title: "Old", slug: "old", date: "2025-03-01" });
    await saved(writer, { title: "Older", slug: "older", date: "2024-03-01" });
    await saved(writer, { title: "Forced past", slug: "forced-past", date: "2026-08-01", upcoming: "past" });
    const live = await saved(writer, { title: "Live", slug: "live", date: "2026-10-01" });
    await publishTalk(db, writer, live.id, NOW);

    const { upcoming, past } = await listTalks(db, writer, NOW);
    expect(upcoming.map((t) => t.slug)).toEqual(["today", "sooner", "live", "later"]);
    expect(past.map((t) => t.slug)).toEqual(["forced-past", "old", "older"]);
    expect(past[0].forced).toBe(true);
    expect(upcoming.find((t) => t.slug === "live")?.state).toBe("published");

    const site = await publishedTalks(db, NOW);
    expect(site.upcoming.map((t) => t.slug)).toEqual(["live"]);
  });
});

describe("validation", () => {
  it("trims fields and keeps link order", () => {
    const input = cleanTalkInput(
      ready({ title: "  Spaced  ", venue: "  ", links: [{ label: " Video ", url: " https://youtu.be/x " }, { label: "Slides", url: "https://s.io/a" }] }),
    );
    expect(input.title).toBe("Spaced");
    expect(input.venue).toBe("");
    expect(input.links).toEqual([
      { label: "Video", url: "https://youtu.be/x" },
      { label: "Slides", url: "https://s.io/a" },
    ]);
  });

  it("needs a valid slug and date on every save", () => {
    expect(checkTalkDraft(ready())).toEqual([]);
    expect(checkTalkDraft(ready({ slug: "Bad Slug" }))[0].field).toBe("slug");
    expect(checkTalkDraft(ready({ slug: "category" }))[0].message).toMatch(/reserved/);
    expect(checkTalkDraft(ready({ slug: "tag" }))[0].message).toMatch(/reserved/);
    expect(checkTalkDraft(ready({ date: "2026-02-30" }))[0].field).toBe("date");
    expect(checkTalkDraft(ready({ date: "" }))[0].field).toBe("date");
    expect(checkTalkDraft(ready({ upcoming: "maybe" as never }))[0].field).toBe("upcoming");
  });

  it("allows up to six links", () => {
    const link = { label: "Slides", url: "https://s.io/a" };
    expect(checkTalkDraft(ready({ links: Array(6).fill(link) }))).toEqual([]);
    expect(checkTalkDraft(ready({ links: Array(7).fill(link) }))[0].message).toMatch(/Up to 6/);
  });

  it("blocks publishing without a title, or with incomplete or non-https links", () => {
    const messages = (input: TalkInput) => checkTalkForPublish(input, NOW).errors.map((e) => e.message);
    expect(messages(ready())).toEqual([]);
    expect(messages(ready({ title: "" }))).toEqual(["Add a title."]);
    expect(messages(ready({ links: [{ label: "", url: "https://s.io" }] }))[0]).toMatch(/add a label/);
    expect(messages(ready({ links: [{ label: "Slides", url: "" }] }))[0]).toMatch(/add a URL/);
    expect(messages(ready({ links: [{ label: "Slides", url: "s.io/deck" }] }))[0]).toMatch(/isn't a full URL/);
    expect(messages(ready({ links: [{ label: "Slides", url: "http://s.io/deck" }] }))[0]).toMatch(/https/);
    expect(messages(ready({ links: [{ label: "Slides", url: "javascript:alert(1)" }] }))[0]).toMatch(/https/);
    expect(messages(ready({ links: [{ label: "Slides", url: "ftp://s.io/deck" }] }))[0]).toMatch(/https/);
    expect(checkTalkForPublish(ready({ links: [{ label: "Slides", url: "http://s.io" }] }), NOW).errors[0].link).toBe(0);
  });

  it("warns about placeholders, duplicates, a missing venue, and an override that disagrees with the date", () => {
    const warnings = (input: TalkInput) => checkTalkForPublish(input, NOW).warnings.map((w) => w.message);
    expect(warnings(ready())).toEqual([]);
    expect(warnings(ready({ links: [{ label: "Slides", url: "https://example.com/slides" }] }))[0]).toMatch(/placeholder/);
    expect(warnings(ready({ links: [{ label: "Video", url: "https://www.example.org/v" }] }))[0]).toMatch(/placeholder/);
    expect(warnings(ready({ links: [{ label: "Video", url: "https://localhost:3000/v" }] }))[0]).toMatch(/placeholder/);
    expect(warnings(ready({ links: [{ label: "Video", url: "https://notexample.com/v" }] }))).toEqual([]);
    const dupe = { label: "Slides", url: "https://s.io/a" };
    expect(warnings(ready({ links: [dupe, { ...dupe, label: "Deck" }] }))[0]).toMatch(/twice/);
    expect(warnings(ready({ venue: "" }))[0]).toMatch(/No venue/);
    expect(warnings(ready({ date: "2026-01-01", upcoming: "upcoming" }))[0]).toMatch(/date has passed/);
    expect(warnings(ready({ date: "2026-12-01", upcoming: "past" }))[0]).toMatch(/still ahead/);
    expect(warnings(ready({ date: "2026-01-01", upcoming: "past" }))).toEqual([]);
  });
});

describe("editing", () => {
  it("creates talks with a unique placeholder slug and today's date", async () => {
    const a = await createTalk(db, writer);
    const b = await createTalk(db, contributor);
    expect([a.slug, b.slug]).toEqual(["untitled", "untitled-2"]);
    expect(a.state).toBe("draft");
    expect(a.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(b.createdBy).toBe("contrib");
  });

  it("saves fields, storing empty optionals as null and the override as a boolean", async () => {
    const talk = await saved(writer, { venue: "", format: " ", status: "", upcoming: "upcoming" });
    expect(talk).toMatchObject({ venue: null, format: null, talkStatus: null, upcoming: true, updatedBy: "writer" });
    expect(talkInput(talk)).toEqual(ready({ venue: "", format: "", status: "", upcoming: "upcoming" }));
  });

  it("skips writing when nothing changed", async () => {
    const talk = await saved(writer);
    const again = await saveTalk(db, writer, talk.id, ready(), talk.updatedAt, { now: NOW });
    expect(again.changed).toBe(false);
    expect(again.talk.updatedAt.getTime()).toBe(talk.updatedAt.getTime());
  });

  it("lets the URL follow the title until published, and keeps slugs unique", async () => {
    await saved(writer, { slug: "taken" });
    const draft = await createTalk(db, writer);
    const { talk } = await saveTalk(db, writer, draft.id, ready({ slug: "taken" }), draft.updatedAt, { autoSlug: true, now: NOW });
    expect(talk.slug).toBe("taken-2");
    await expect(saveTalk(db, writer, draft.id, ready({ slug: "taken" }), talk.updatedAt, { now: NOW })).rejects.toThrow(
      /already uses/,
    );

    await publishTalk(db, writer, talk.id, NOW);
    const [live] = await db.select().from(talks).where(eq(talks.id, talk.id));
    await expect(
      saveTalk(db, writer, talk.id, ready({ slug: "taken" }), live.updatedAt, { autoSlug: true, now: NOW }),
    ).rejects.toThrow(/already uses/);
  });

  it("rejects another person's newer save instead of overwriting it", async () => {
    const talk = await saved(writer);
    await saveTalk(db, editor, talk.id, ready({ title: "Editor's title" }), talk.updatedAt, { now: NOW });
    const stale = saveTalk(db, writer, talk.id, ready({ title: "Writer's title" }), talk.updatedAt, { now: NOW });
    await expect(stale).rejects.toBeInstanceOf(TalkConflictError);
    await expect(stale).rejects.toThrow(/editor name saved this talk/);
    const [row] = await db.select().from(talks).where(eq(talks.id, talk.id));
    expect(row.title).toBe("Editor's title");
  });

  it("doesn't conflict with your own earlier save", async () => {
    const created = await createTalk(db, writer);
    await saveTalk(db, writer, created.id, ready({ title: "One" }), created.updatedAt, { now: NOW });
    const { talk } = await saveTalk(db, writer, created.id, ready({ title: "Two" }), created.updatedAt, { now: NOW });
    expect(talk.title).toBe("Two");
  });

  it("saves a published talk straight to the site, but only if it still passes the publish checks", async () => {
    const talk = await saved(writer);
    const live = await publishTalk(db, writer, talk.id, NOW);
    const result = await saveTalk(db, writer, talk.id, ready({ venue: "Big Conf, Berlin" }), live.updatedAt, { now: NOW });
    expect(result).toMatchObject({ changed: true, live: true });
    expect((await publishedTalks(db, NOW)).upcoming[0].venue).toBe("Big Conf, Berlin");

    await expect(
      saveTalk(db, writer, talk.id, ready({ links: [{ label: "Slides", url: "http://s.io" }] }), result.talk.updatedAt, { now: NOW }),
    ).rejects.toThrow(/live, so it wasn't saved/);
    await expect(saveTalk(db, writer, talk.id, ready({ title: "" }), result.talk.updatedAt, { now: NOW })).rejects.toThrow(
      /Add a title/,
    );
    // A draft can hold a half-typed link.
    const draft = await saved(writer, { slug: "draft", links: [{ label: "Slides", url: "htt" }] });
    expect(draft.links).toEqual([{ label: "Slides", url: "htt" }]);
  });

  it("says a missing talk no longer exists", async () => {
    await expect(getTalkForEdit(db, writer, "nope")).rejects.toBeInstanceOf(TalkError);
    await expect(getTalkForEdit(db, writer, "00000000-0000-4000-8000-000000000000")).rejects.toThrow(/no longer exists/);
  });
});

describe("publishing", () => {
  it("publishes and unpublishes", async () => {
    const talk = await saved(writer);
    expect((await publishedTalks(db, NOW)).upcoming).toEqual([]);
    await publishTalk(db, writer, talk.id, NOW);
    const site = await publishedTalks(db, NOW);
    expect(site.upcoming).toEqual([
      {
        slug: "small-software-quietly",
        title: "Small software, quietly",
        date: "2026-09-10",
        venue: "Local Meetup, Portland",
        format: "30 min talk",
        status: "Confirmed",
        links: [{ label: "Event page", url: "https://meetup.org/small-software" }],
      },
    ]);
    await unpublishTalk(db, writer, talk.id);
    expect((await publishedTalks(db, NOW)).upcoming).toEqual([]);
  });

  it("refuses to publish a talk with errors", async () => {
    const talk = await saved(writer, { title: "" });
    await expect(publishTalk(db, writer, talk.id, NOW)).rejects.toThrow(/Add a title/);
  });
});

describe("roles", () => {
  it("lets a contributor draft their own talk but not publish, unpublish, or delete", async () => {
    const talk = await saved(contributor);
    const view = await getTalkForEdit(db, contributor, talk.id);
    expect(view.permissions).toEqual({ edit: true, publish: false, unpublish: false, delete: false });
    await expect(publishTalk(db, contributor, talk.id, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteTalk(db, contributor, talk.id)).rejects.toBeInstanceOf(ForbiddenError);

    await publishTalk(db, writer, talk.id, NOW);
    await expect(unpublishTalk(db, contributor, talk.id)).rejects.toBeInstanceOf(ForbiddenError);
    const [live] = await db.select().from(talks).where(eq(talks.id, talk.id));
    // Once live, it's no longer theirs to edit.
    await expect(saveTalk(db, contributor, talk.id, ready({ title: "Changed" }), live.updatedAt, { now: NOW })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect((await getTalkForEdit(db, contributor, talk.id)).permissions.edit).toBe(false);
  });

  it("keeps contributors out of other people's talks", async () => {
    const talk = await saved(contributor);
    await expect(
      saveTalk(db, otherContributor, talk.id, ready({ title: "Mine now" }), talk.updatedAt, { now: NOW }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const { past, upcoming } = await listTalks(db, otherContributor, NOW);
    expect([...past, ...upcoming].map((t) => t.canEdit)).toEqual([false]);
  });

  it("lets writers publish and edit anyone's talk, and only editors delete", async () => {
    const talk = await saved(contributor);
    expect((await getTalkForEdit(db, writer, talk.id)).permissions).toEqual({
      edit: true,
      publish: true,
      unpublish: true,
      delete: false,
    });
    await expect(deleteTalk(db, writer, talk.id)).rejects.toBeInstanceOf(ForbiddenError);
    await publishTalk(db, writer, talk.id, NOW);
    expect(await deleteTalk(db, editor, talk.id)).toEqual({ wasLive: true });
    expect(await db.select().from(talks)).toEqual([]);
  });
});

describe("Event structured data", () => {
  it("describes each talk at its anchor, with location and attendance mode", () => {
    const [inPerson, online, bare] = talkSchemas([
      { slug: "a", title: "A", date: "2026-09-10", venue: "Meetup, Portland", format: "Talk", status: "Confirmed", links: [] },
      { slug: "b", title: "B", date: "2026-10-01", venue: "Online", links: [{ label: "Video", url: "https://youtu.be/b" }] },
      { slug: "c", title: "C", date: "2026-10-02", status: "Cancelled", links: [] },
    ]);
    expect(inPerson).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Event",
      "@id": "https://owinz.io/talks/#a",
      url: "https://owinz.io/talks/#a",
      startDate: "2026-09-10",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: { "@type": "Place", name: "Meetup, Portland" },
      organizer: { "@type": "Organization", name: "Meetup, Portland" },
    });
    expect(inPerson).not.toHaveProperty("sameAs");
    expect(online).toMatchObject({
      eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
      location: { "@type": "VirtualLocation", name: "Online" },
      sameAs: ["https://youtu.be/b"],
    });
    expect(online).not.toHaveProperty("organizer");
    expect(bare).toMatchObject({ eventStatus: "https://schema.org/EventCancelled", location: { "@type": "VirtualLocation" } });
  });
});
