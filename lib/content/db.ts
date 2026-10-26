// Database content source: what's live, rendered into the shapes the site
// uses. Posts and projects render their published revision, never the
// working draft (see lib/db/schema.ts). Uncached; lib/content/index.ts wraps
// these in `use cache`.
import { and, eq, inArray, type SQL } from "drizzle-orm";
import type { Db } from "../db";
import {
  assets,
  posts,
  projects,
  revisions,
  talks,
  type AssetRow,
  type PostRow,
  type ProjectRow,
} from "../db/schema";
import {
  buildProject,
  buildWritingPost,
  newestFirst,
  splitTalks,
  type ImageResolver,
} from "./render";
import { resolveRefs, termsById, toRef } from "./terms";
import type { ProjectPost, Talk, WritingPost } from "./types";

/** A published post snapshot (lib/content/revisions.ts postSnapshot). */
type PostFields = Pick<PostRow, "slug" | "title" | "excerpt" | "categoryId" | "date" | "updated" | "byline" | "body"> & {
  tagIds?: string[];
};
/** A published project snapshot (lib/content/revisions.ts projectSnapshot). */
type ProjectFields = Omit<
  ProjectRow,
  "id" | "sortOrder" | "state" | "publishedSlug" | "publishedRevisionId" | "createdBy" | "updatedBy" | "createdAt" | "updatedAt"
> & { technologyIds?: string[] };

/** Photo URL on the site; `v` changes when the photo is replaced, so it can be cached forever. */
export function assetSrc(collection: "writing" | "projects", slug: string, asset: AssetRow): string {
  const version = asset.updatedAt.getTime().toString(36);
  return `/${collection}/${slug}/${encodeURIComponent(asset.name)}?v=${version}`;
}

function resolverFor(slug: string, rows: AssetRow[] = [], collection: "writing" | "projects" = "writing"): ImageResolver {
  const byName = new Map(rows.map((row) => [row.name, row]));
  return async (name) => {
    const asset = byName.get(name);
    if (!asset) return undefined;
    return {
      src: assetSrc(collection, slug, asset),
      ...(asset.width && asset.height ? { width: asset.width, height: asset.height } : {}),
    };
  };
}

async function postAssets(db: Db, postIds: string[]): Promise<Map<string, AssetRow[]>> {
  const byPost = new Map<string, AssetRow[]>();
  if (postIds.length === 0) return byPost;
  for (const row of await db.select().from(assets).where(inArray(assets.postId, postIds))) {
    byPost.set(row.postId!, [...(byPost.get(row.postId!) ?? []), row]);
  }
  return byPost;
}

/** Live posts as (id, rendered post) pairs. */
async function livePosts(db: Db, where?: SQL): Promise<{ id: string; post: WritingPost }[]> {
  const rows = await db
    .select({ id: posts.id, slug: posts.publishedSlug, snapshot: revisions.snapshot })
    .from(posts)
    .innerJoin(revisions, eq(revisions.id, posts.publishedRevisionId))
    .where(and(eq(posts.state, "published"), where));
  const [byPost, byId] = await Promise.all([postAssets(db, rows.map((r) => r.id)), termsById(db, "writing")]);
  return Promise.all(
    rows.map(async ({ id, slug, snapshot }) => {
      const { categoryId, tagIds, ...fields } = snapshot as PostFields;
      const category = categoryId ? byId.get(categoryId) : undefined;
      const source = {
        ...fields,
        slug: slug!,
        // Names come from the terms table, so a rename shows on every live post.
        category: category ? toRef(category) : null,
        tags: resolveRefs(tagIds, byId),
      };
      return { id, post: await buildWritingPost(source, resolverFor(source.slug, byPost.get(id))) };
    }),
  );
}

export async function publishedPosts(db: Db): Promise<WritingPost[]> {
  return (await livePosts(db)).map((r) => r.post).sort(newestFirst);
}

export async function publishedPost(db: Db, slug: string): Promise<WritingPost | null> {
  const [live] = await livePosts(db, eq(posts.publishedSlug, slug));
  return live?.post ?? null;
}

/** A photo of a live post, if the live version actually shows it. */
export async function publishedPostAsset(db: Db, slug: string, name: string): Promise<AssetRow | null> {
  const [live] = await livePosts(db, eq(posts.publishedSlug, slug));
  if (!live?.post.images.includes(name)) return null;
  const [row] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.postId, live.id), eq(assets.name, name)));
  return row ?? null;
}

async function projectAssets(db: Db, projectIds: string[]): Promise<Map<string, AssetRow[]>> {
  const byProject = new Map<string, AssetRow[]>();
  if (projectIds.length === 0) return byProject;
  for (const row of await db.select().from(assets).where(inArray(assets.projectId, projectIds))) {
    byProject.set(row.projectId!, [...(byProject.get(row.projectId!) ?? []), row]);
  }
  return byProject;
}

/**
 * Live projects as (id, rendered project) pairs, in /projects display order.
 * The order comes from the row (reordering applies without republishing);
 * everything else from the published revision.
 */
async function liveProjects(db: Db, where?: SQL): Promise<{ id: string; project: ProjectPost }[]> {
  const rows = await db
    .select({ id: projects.id, slug: projects.publishedSlug, sortOrder: projects.sortOrder, snapshot: revisions.snapshot })
    .from(projects)
    .innerJoin(revisions, eq(revisions.id, projects.publishedRevisionId))
    .where(and(eq(projects.state, "published"), where));
  const [byProject, byId] = await Promise.all([projectAssets(db, rows.map((r) => r.id)), termsById(db, "projects")]);
  const live = await Promise.all(
    rows.map(async ({ id, slug, sortOrder, snapshot }) => {
      const { categoryId, technologyIds, projectStatus, ...fields } = snapshot as ProjectFields;
      const category = categoryId ? byId.get(categoryId) : undefined;
      const source = {
        ...fields,
        slug: slug!,
        status: projectStatus,
        order: sortOrder,
        // Names come from the terms table, so a rename shows on every live project.
        category: category ? toRef(category) : null,
        technologies: resolveRefs(technologyIds, byId),
      };
      return { id, project: await buildProject(source, resolverFor(source.slug, byProject.get(id), "projects")) };
    }),
  );
  return live.sort((a, b) => a.project.order - b.project.order || a.project.title.localeCompare(b.project.title));
}

export async function publishedProjects(db: Db): Promise<ProjectPost[]> {
  return (await liveProjects(db)).map((r) => r.project);
}

export async function publishedProject(db: Db, slug: string): Promise<ProjectPost | null> {
  const [live] = await liveProjects(db, eq(projects.publishedSlug, slug));
  return live?.project ?? null;
}

/** A photo of a live project, if the live version shows it (in the text or as the cover). */
export async function publishedProjectAsset(db: Db, slug: string, name: string): Promise<AssetRow | null> {
  const [live] = await liveProjects(db, eq(projects.publishedSlug, slug));
  if (!live?.project.images.includes(name)) return null;
  const [row] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.projectId, live.id), eq(assets.name, name)));
  return row ?? null;
}

export async function publishedTalks(db: Db, now: Date): Promise<{ upcoming: Talk[]; past: Talk[] }> {
  const rows = await db.select().from(talks).where(eq(talks.state, "published"));
  return splitTalks(
    rows.map((row) => ({
      ...row,
      status: row.talkStatus ?? undefined,
      venue: row.venue ?? undefined,
      format: row.format ?? undefined,
    })),
    now,
  );
}
