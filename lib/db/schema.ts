// Content schema. Markdown bodies are stored verbatim; the frontmatter that
// used to live in each file is split into typed columns. Calendar dates
// (`date`, `launchDate`, `updated`) are `date` columns read back as
// "YYYY-MM-DD" strings, so they never shift with the server's time zone.
//
// Posts and projects separate what's being edited from what's live: the row
// itself is the working draft, and the site renders the revision that
// `published_revision_id` points at. Editing never changes the live page;
// publishing snapshots the draft into a new revision and points at it.
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth-schema";

export * from "./auth-schema";

/** Whether the content is on the site; drafts are visible only in the CMS. */
export const publishState = pgEnum("publish_state", ["draft", "published"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// URL slugs: lowercase words separated by single hyphens.
const slugCheck = (table: string, column: { name: string }) =>
  check(`${table}_slug_format`, sql.raw(`"${column.name}" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`));

/** CMS accounts that created and last changed the row; null for imported content or removed users. */
const authorship = {
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
};

/** Live state of a post or project; see the note at the top of the file. */
const publication = {
  state: publishState("state").notNull().default("draft"),
  /** URL slug while live, fixed at publish so renaming a draft doesn't move the page. */
  publishedSlug: text("published_slug"),
  publishedRevisionId: uuid("published_revision_id").references((): AnyPgColumn => revisions.id, {
    onDelete: "set null",
  }),
};

// A live post must point at the revision it renders. This also makes
// deleting that revision fail rather than silently take the page down.
const liveCheck = (table: string) =>
  check(
    `${table}_live_has_revision`,
    sql.raw(`state = 'draft' or (published_revision_id is not null and published_slug is not null)`),
  );

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    category: text("category"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    date: date("date", { mode: "string" }).notNull(),
    updated: date("updated", { mode: "string" }),
    /**
     * Author name shown to readers, independent of who wrote or published it
     * in the CMS (created_by / updated_by). Null shows the site owner.
     */
    byline: text("byline"),
    body: text("body").notNull().default(""),
    ...publication,
    ...authorship,
    ...timestamps,
  },
  (t) => [
    uniqueIndex("posts_slug_key").on(t.slug),
    uniqueIndex("posts_published_slug_key").on(t.publishedSlug),
    slugCheck("posts", t.slug),
    liveCheck("posts"),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    purpose: text("purpose").notNull().default(""),
    challenge: text("challenge").notNull().default(""),
    technologies: text("technologies").array().notNull().default(sql`'{}'::text[]`),
    category: text("category"),
    role: text("role"),
    /** Free-text status shown on the page, e.g. "Shipped · v1.3". */
    projectStatus: text("project_status"),
    platform: text("platform"),
    sortOrder: integer("sort_order").notNull().default(0),
    launchDate: date("launch_date", { mode: "string" }),
    updated: date("updated", { mode: "string" }),
    liveUrl: text("live_url"),
    sourceUrl: text("source_url"),
    image: text("image"),
    body: text("body").notNull().default(""),
    ...publication,
    ...authorship,
    ...timestamps,
  },
  (t) => [
    uniqueIndex("projects_slug_key").on(t.slug),
    uniqueIndex("projects_published_slug_key").on(t.publishedSlug),
    slugCheck("projects", t.slug),
    liveCheck("projects"),
  ],
);

export interface TalkLink {
  label: string;
  url: string;
}

export const talks = pgTable(
  "talks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    venue: text("venue"),
    format: text("format"),
    /** Free-text status, e.g. "Confirmed". */
    talkStatus: text("talk_status"),
    /** Overrides the date when set: true/false forces upcoming/past. */
    upcoming: boolean("upcoming"),
    links: jsonb("links").$type<TalkLink[]>().notNull().default([]),
    /** Talks are small and have no version history: saving a published talk updates it live. */
    state: publishState("state").notNull().default("draft"),
    ...authorship,
    ...timestamps,
  },
  (t) => [uniqueIndex("talks_slug_key").on(t.slug), slugCheck("talks", t.slug)],
);

/**
 * Photos uploaded for a post or project. The file in Blob is already
 * processed (rotated, resized, metadata stripped); the site serves it at
 * /<collection>/<slug>/<name>.
 */
export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    /** File name as written in the Markdown, e.g. "harbor.jpg". */
    name: text("name").notNull(),
    blobUrl: text("blob_url").notNull(),
    blobPathname: text("blob_pathname").notNull(),
    contentType: text("content_type").notNull(),
    width: integer("width"),
    height: integer("height"),
    bytes: integer("bytes").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("assets_post_name_key").on(t.postId, t.name),
    uniqueIndex("assets_project_name_key").on(t.projectId, t.name),
    check("assets_one_owner", sql`num_nonnulls(${t.postId}, ${t.projectId}) = 1`),
  ],
);

export const revisionKind = pgEnum("revision_kind", ["published", "autosave"]);

/** How many revisions of each kind a post or project keeps. */
export const REVISION_LIMITS = { published: 10, autosave: 50 } as const;

/**
 * Snapshots of a post or project: one per publish, and one per editor
 * autosave that actually changed something. Older ones beyond
 * REVISION_LIMITS are pruned on insert (lib/content/revisions.ts).
 */
export const revisions = pgTable(
  "revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Insertion order; timestamps can tie, this can't. */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    kind: revisionKind("kind").notNull(),
    /** Every editable field plus the Markdown body, as saved. */
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    /** SHA-256 of the snapshot; an autosave identical to the latest revision is skipped. */
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("revisions_post_idx").on(t.postId, t.kind, t.seq),
    index("revisions_project_idx").on(t.projectId, t.kind, t.seq),
    check("revisions_one_owner", sql`num_nonnulls(${t.postId}, ${t.projectId}) = 1`),
  ],
);

export type PostRow = typeof posts.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type TalkRow = typeof talks.$inferSelect;
export type AssetRow = typeof assets.$inferSelect;
export type RevisionRow = typeof revisions.$inferSelect;
