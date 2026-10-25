// The CMS overview: what exists in each collection, what's live, and which
// live posts and projects have edits waiting to be published.
import { desc, eq } from "drizzle-orm";
import type { Db } from "../db";
import { posts, projects, revisions, talks } from "../db/schema";
import { postSnapshot, projectSnapshot, snapshotHash } from "../content/revisions";

export interface OverviewItem {
  id: string;
  title: string;
  slug: string;
  state: "draft" | "published";
  /** Live, but the draft differs from what's live. */
  unpublishedChanges: boolean;
  updatedAt: Date;
}

export interface CollectionOverview {
  live: number;
  drafts: number;
  items: OverviewItem[];
}

export interface Overview {
  writing: CollectionOverview;
  projects: CollectionOverview;
  talks: CollectionOverview;
}

function summarize(items: OverviewItem[]): CollectionOverview {
  return {
    live: items.filter((i) => i.state === "published").length,
    drafts: items.filter((i) => i.state === "draft").length,
    items: [...items].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
  };
}

export async function overview(db: Db): Promise<Overview> {
  const [postRows, projectRows, talkRows] = await Promise.all([
    db
      .select({ row: posts, liveHash: revisions.contentHash })
      .from(posts)
      .leftJoin(revisions, eq(revisions.id, posts.publishedRevisionId))
      .orderBy(desc(posts.updatedAt)),
    db
      .select({ row: projects, liveHash: revisions.contentHash })
      .from(projects)
      .leftJoin(revisions, eq(revisions.id, projects.publishedRevisionId))
      .orderBy(desc(projects.updatedAt)),
    db.select().from(talks).orderBy(desc(talks.updatedAt)),
  ]);

  return {
    writing: summarize(
      postRows.map(({ row, liveHash }) => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        state: row.state,
        unpublishedChanges: row.state === "published" && liveHash !== snapshotHash(postSnapshot(row)),
        updatedAt: row.updatedAt,
      })),
    ),
    projects: summarize(
      projectRows.map(({ row, liveHash }) => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        state: row.state,
        unpublishedChanges: row.state === "published" && liveHash !== snapshotHash(projectSnapshot(row)),
        updatedAt: row.updatedAt,
      })),
    ),
    talks: summarize(
      talkRows.map((row) => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        state: row.state,
        unpublishedChanges: false,
        updatedAt: row.updatedAt,
      })),
    ),
  };
}
