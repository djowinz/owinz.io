import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import path from "path";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../lib/db";
import { projects, projectTags, users } from "../lib/db/schema";
import { publishedProject, publishedProjectAsset, publishedProjects } from "../lib/content/db";
import { getProjects as fileProjects } from "../lib/content/files";
import { listRevisions } from "../lib/content/revisions";
import type { Actor } from "../lib/cms/permissions";
import {
  attachProjectPhoto,
  createProject,
  deleteProject,
  detachProjectPhoto,
  draftProjectInput,
  getProjectForEdit,
  listProjects,
  moveProject,
  ProjectConflictError,
  publish,
  reorderProjects,
  restore,
  saveProject,
  unpublish,
} from "../lib/cms/projects";
import { checkProjectForPublish, type ProjectInput } from "../lib/cms/validate-project";
import { createTerm, deleteTerm, listTaxonomy, mergeTags, updateTerm } from "../lib/cms/taxonomy";
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

beforeEach(async () => {
  await db.execute(sql`truncate users, posts, projects, assets, revisions, terms cascade`);
  for (const a of [editor, writer, contributor, otherContributor]) {
    await db.insert(users).values({ id: a.id, name: `${a.id} name`, email: `${a.id}@example.com`, role: a.role });
  }
});

const ready = (overrides: Partial<ProjectInput> = {}): ProjectInput => ({
  title: "Chronicle",
  slug: "chronicle",
  description: "A personal finance tracker that focuses on trends and patterns rather than transaction-level details.",
  purpose: "To show habits.",
  challenge: "Charts that explain themselves.",
  categoryId: null,
  technologyIds: [],
  role: "Design, engineering",
  projectStatus: "Shipped · v1.3",
  platform: "Web",
  launchDate: "2026-03-15",
  updated: null,
  liveUrl: "https://chronicle.finance",
  sourceUrl: null,
  image: null,
  body: "The story.\n\n## How\n\nMore text.\n",
  ...overrides,
});

async function edited(actor: Actor, overrides: Partial<ProjectInput> = {}, title = "Draft") {
  const created = await createProject(db, actor, title);
  const { project } = await saveProject(db, actor, created.id, ready(overrides), created.updatedAt);
  return project;
}

const photo = (name: string, pathname = `projects/p/${name}`) => ({
  name,
  blobUrl: `local://${pathname}`,
  blobPathname: pathname,
  contentType: "image/jpeg",
  width: 1600,
  height: 1000,
  bytes: 1000,
});

const tech = (name: string, actor: Actor = writer) => createTerm(db, actor, { kind: "tag", collection: "projects", name });
const category = (name: string) => createTerm(db, writer, { kind: "category", collection: "projects", name });

describe("creating and saving drafts", () => {
  it("gives new projects a unique slug and puts them last in the order", async () => {
    const a = await createProject(db, writer, "Same name");
    const b = await createProject(db, writer, "Same name");
    expect([a.slug, b.slug]).toEqual(["same-name", "same-name-2"]);
    expect(b.sortOrder).toBe(a.sortOrder + 1);
    expect(a.createdBy).toBe("writer");
  });

  it("records an autosave only when something changed", async () => {
    const created = await createProject(db, writer, "Draft");
    const first = await saveProject(db, writer, created.id, ready(), created.updatedAt);
    expect(first.revisionSaved).toBe(true);
    const again = await saveProject(db, writer, created.id, ready(), first.project.updatedAt);
    expect(again.revisionSaved).toBe(false);
    expect(await listRevisions(db, { projectId: created.id }, "autosave")).toHaveLength(1);
  });

  it("rejects bad slugs, reserved slugs, bad URLs, and a taken URL", async () => {
    const created = await createProject(db, writer, "Draft");
    const at = created.updatedAt;
    await expect(saveProject(db, writer, created.id, ready({ slug: "Bad Slug" }), at)).rejects.toThrow("lowercase");
    await expect(saveProject(db, writer, created.id, ready({ slug: "technology" }), at)).rejects.toThrow("reserved");
    await expect(saveProject(db, writer, created.id, ready({ liveUrl: "chronicle.finance" }), at)).rejects.toThrow("http(s)");
    await expect(saveProject(db, writer, created.id, ready({ launchDate: "2026-02-30" }), at)).rejects.toThrow("valid date");
    await edited(writer, { slug: "taken" });
    await expect(saveProject(db, writer, created.id, ready({ slug: "taken" }), at)).rejects.toThrow("already uses");
  });

  it("lets a following URL take the next free one until first published", async () => {
    await edited(writer, { slug: "same" });
    const created = await createProject(db, writer, "Other");
    const { project } = await saveProject(db, writer, created.id, ready({ slug: "same" }), created.updatedAt, { autoSlug: true });
    expect(project.slug).toBe("same-2");
  });

  it("refuses to overwrite someone else's newer save", async () => {
    const created = await createProject(db, writer, "Draft");
    const opened = created.updatedAt;
    await saveProject(db, editor, created.id, ready({ title: "Editor's change" }), opened);
    await expect(saveProject(db, writer, created.id, ready({ title: "Writer's" }), opened)).rejects.toBeInstanceOf(
      ProjectConflictError,
    );
  });

  it("keeps technologies in order, deduped, and refuses terms from another collection", async () => {
    const [react, node] = [await tech("React"), await tech("Node.js")];
    const p = await edited(writer, { technologyIds: [node.id, react.id, node.id], role: "  " });
    expect(await draftProjectInput(db, p)).toMatchObject({ technologyIds: [node.id, react.id], role: null });
    const writingTag = await createTerm(db, writer, { kind: "tag", collection: "writing", name: "React" });
    await expect(saveProject(db, writer, p.id, ready({ technologyIds: [writingTag.id] }), p.updatedAt)).rejects.toThrow(
      "technology no longer exists",
    );
    const writingCategory = await createTerm(db, writer, { kind: "category", collection: "writing", name: "Essays" });
    await expect(saveProject(db, writer, p.id, ready({ categoryId: writingCategory.id }), p.updatedAt)).rejects.toThrow(
      "category no longer exists",
    );
  });
});

describe("roles", () => {
  it("contributors draft their own projects but can't publish, reorder, or delete", async () => {
    const mine = await edited(contributor);
    await expect(publish(db, contributor, mine.id)).rejects.toThrow("Not allowed");
    await expect(moveProject(db, contributor, mine.id, -1)).rejects.toThrow("Not allowed");
    await expect(deleteProject(db, contributor, mine.id)).rejects.toThrow("Not allowed");
    const p = await getProjectForEdit(db, contributor, mine.id);
    expect(p.permissions).toEqual({ edit: true, publish: false, unpublish: false, restore: false, delete: false });
    await expect(saveProject(db, otherContributor, mine.id, ready(), mine.updatedAt)).rejects.toThrow("Not allowed");
    // Contributors can add technologies while drafting, but not categories.
    await expect(tech("Elixir", contributor)).resolves.toMatchObject({ name: "Elixir" });
    await expect(createTerm(db, contributor, { kind: "category", collection: "projects", name: "X" })).rejects.toThrow(
      "Not allowed",
    );
  });

  it("contributors lose edit access once a writer publishes their project", async () => {
    const mine = await edited(contributor);
    await publish(db, writer, mine.id);
    const fresh = (await getProjectForEdit(db, writer, mine.id)).project;
    await expect(saveProject(db, contributor, mine.id, ready({ title: "x" }), fresh.updatedAt)).rejects.toThrow("Not allowed");
    expect((await listProjects(db, contributor)).find((p) => p.id === mine.id)?.canEdit).toBe(false);
  });

  it("writers publish, unpublish, and reorder; only editors delete", async () => {
    const p = await edited(writer);
    await publish(db, writer, p.id);
    await unpublish(db, writer, p.id);
    await expect(deleteProject(db, writer, p.id)).rejects.toThrow("Not allowed");
    await deleteProject(db, editor, p.id);
    expect(await db.select().from(projects).where(eq(projects.id, p.id))).toHaveLength(0);
  });
});

describe("publishing", () => {
  it("blocks on errors and reports warnings", () => {
    const ok = checkProjectForPublish(ready({ image: "cover.jpg" }), new Set(["cover.jpg"]));
    expect(ok.errors).toEqual([]);
    const bad = checkProjectForPublish(
      ready({
        title: "",
        body: "![](missing.jpg)",
        image: "nope.jpg",
        launchDate: "2026-03-15",
        updated: "2026-01-01",
        description: "Short.",
        sourceUrl: "https://github.com/username/chronicle",
      }),
      new Set(),
    );
    const errors = bad.errors.map((e) => e.message).join(" ");
    for (const expected of ["Add a title", "before the launch date", '"missing.jpg" isn\'t uploaded', 'cover image "nope.jpg"']) {
      expect(errors).toContain(expected);
    }
    expect(bad.warnings.map((w) => w.field)).toEqual(expect.arrayContaining(["description", "sourceUrl", "categoryId", "technologyIds"]));
  });

  it("refuses to publish a project with errors", async () => {
    const p = await edited(writer, { image: "cover.jpg" });
    await expect(publish(db, writer, p.id)).rejects.toThrow("isn't uploaded");
  });

  it("never changes the live page while the draft is edited", async () => {
    const p = await edited(writer);
    await publish(db, writer, p.id);
    const fresh = (await getProjectForEdit(db, writer, p.id)).project;
    await saveProject(db, writer, p.id, ready({ title: "Changed in the draft" }), fresh.updatedAt);
    expect((await publishedProject(db, "chronicle"))?.title).toBe("Chronicle");
    expect((await getProjectForEdit(db, writer, p.id)).unpublishedChanges).toBe(true);
  });
});

describe("taxonomy on the live site", () => {
  it("renders category and technology names from terms, so renames show without republishing", async () => {
    const [finance, react, d3] = [await category("Personal Finance"), await tech("React"), await tech("D3.js")];
    const p = await edited(writer, { categoryId: finance.id, technologyIds: [react.id, d3.id] });
    await publish(db, writer, p.id);
    let live = await publishedProject(db, "chronicle");
    expect(live).toMatchObject({
      category: "Personal Finance",
      categoryRef: { name: "Personal Finance", slug: "personal-finance" },
      technologies: ["React", "D3.js"],
      technologyRefs: [
        { name: "React", slug: "react" },
        { name: "D3.js", slug: "d3-js" },
      ],
    });

    await updateTerm(db, writer, d3.id, { name: "D3" });
    live = await publishedProject(db, "chronicle");
    expect(live?.technologies).toEqual(["React", "D3"]);
    expect((await getProjectForEdit(db, writer, p.id)).unpublishedChanges).toBe(false);
  });

  it("counts project usage, protects used terms, and merges technologies in drafts and versions", async () => {
    const [react, reactjs, tooling] = [await tech("React"), await tech("ReactJS"), await category("Tooling")];
    const a = await edited(writer, { categoryId: tooling.id, technologyIds: [reactjs.id] }, "A");
    await publish(db, writer, a.id);
    await edited(writer, { slug: "b", technologyIds: [react.id, reactjs.id] }, "B");

    const { categories, tags } = await listTaxonomy(db, "projects");
    expect(categories.find((c) => c.id === tooling.id)).toMatchObject({ drafts: 1, live: 1 });
    expect(tags.find((t) => t.id === reactjs.id)).toMatchObject({ drafts: 2, live: 1 });
    await expect(deleteTerm(db, writer, tooling.id)).rejects.toThrow("live project");

    expect(await mergeTags(db, writer, reactjs.id, react.id)).toBe("projects");
    const rows = await db.select().from(projectTags);
    expect(rows.map((r) => r.termId)).toEqual([react.id, react.id]);
    expect((await publishedProject(db, "chronicle"))?.technologies).toEqual(["React"]);
    const [version] = await listRevisions(db, { projectId: a.id }, "published");
    expect(version.snapshot.technologyIds).toEqual([react.id]);
  });
});

describe("display order", () => {
  it("reorders /projects at once, without marking projects edited or bumping updated_at", async () => {
    const a = await edited(writer, { slug: "a", title: "A" }, "A");
    const b = await edited(writer, { slug: "b", title: "B" }, "B");
    const c = await edited(writer, { slug: "c", title: "C" }, "C");
    for (const p of [a, b, c]) await publish(db, writer, p.id);
    expect((await publishedProjects(db)).map((p) => p.slug)).toEqual(["a", "b", "c"]);

    const before = (await getProjectForEdit(db, writer, c.id)).project.updatedAt;
    await moveProject(db, editor, c.id, -1);
    expect((await publishedProjects(db)).map((p) => p.slug)).toEqual(["a", "c", "b"]);
    expect((await listProjects(db, writer)).map((p) => [p.slug, p.unpublishedChanges])).toEqual([
      ["a", false],
      ["c", false],
      ["b", false],
    ]);
    expect((await getProjectForEdit(db, writer, c.id)).project.updatedAt).toEqual(before);

    await reorderProjects(db, writer, [b.id, a.id, c.id]);
    expect((await publishedProjects(db)).map((p) => p.slug)).toEqual(["b", "a", "c"]);
    await expect(reorderProjects(db, writer, [a.id, b.id])).rejects.toThrow("changed while you were reordering");
  });
});

describe("history", () => {
  it("restores an earlier version, dropping technologies deleted since", async () => {
    const [react, old] = [await tech("React"), await tech("Old")];
    const created = await createProject(db, writer, "Draft");
    const v1 = await saveProject(db, writer, created.id, ready({ title: "Version one", technologyIds: [react.id, old.id] }), created.updatedAt);
    await saveProject(db, writer, created.id, ready({ title: "Version two", technologyIds: [react.id] }), v1.project.updatedAt);
    await deleteTerm(db, writer, old.id);
    const [, versionOne] = await listRevisions(db, { projectId: created.id }, "autosave");

    const { project, input } = await restore(db, writer, created.id, versionOne.id);
    expect(project.title).toBe("Version one");
    expect(input.technologyIds).toEqual([react.id]);
    await expect(restore(db, contributor, created.id, versionOne.id)).rejects.toThrow("Not allowed");
  });
});

describe("photos", () => {
  it("serves the cover and body photos of the live version only", async () => {
    const p = await edited(writer, { image: "cover.jpg", body: "Story.\n\n![Sketch](sketch.png)\n" });
    for (const name of ["cover.jpg", "sketch.png", "unused.jpg"]) await attachProjectPhoto(db, writer, p.id, photo(name));
    expect(await publishedProjectAsset(db, "chronicle", "cover.jpg")).toBeNull(); // not live yet

    await publish(db, writer, p.id);
    const live = await publishedProject(db, "chronicle");
    expect(live?.image).toMatch(/^\/projects\/chronicle\/cover\.jpg\?v=/);
    expect(live?.content).toMatch(/src="\/projects\/chronicle\/sketch\.png\?v=[^"]+"/);
    expect(live?.markdown).toContain("](https://owinz.io/projects/chronicle/sketch.png)");
    expect((await publishedProjectAsset(db, "chronicle", "cover.jpg"))?.blobPathname).toBe("projects/p/cover.jpg");
    expect(await publishedProjectAsset(db, "chronicle", "sketch.png")).not.toBeNull();
    expect(await publishedProjectAsset(db, "chronicle", "unused.jpg")).toBeNull();
    expect(await publishedProjectAsset(db, "other", "cover.jpg")).toBeNull();
  });

  it("replaces same-named photos and won't remove one the live version shows", async () => {
    const p = await edited(writer, { image: "cover.jpg" });
    const first = await attachProjectPhoto(db, writer, p.id, photo("cover.jpg", "projects/p/cover-a.jpg"));
    expect(first.replacedPathname).toBeNull();
    const second = await attachProjectPhoto(db, writer, p.id, photo("cover.jpg", "projects/p/cover-b.jpg"));
    expect(second.replacedPathname).toBe("projects/p/cover-a.jpg");
    await publish(db, writer, p.id);
    await expect(detachProjectPhoto(db, writer, p.id, "cover.jpg")).rejects.toThrow("live version shows");
    await expect(attachProjectPhoto(db, writer, p.id, photo("Bad Name.jpg"))).rejects.toThrow("valid photo name");
    await expect(attachProjectPhoto(db, contributor, p.id, photo("x.jpg"))).rejects.toThrow("Not allowed");
  });

  it("returns stored files to delete with the project", async () => {
    const p = await edited(writer);
    await attachProjectPhoto(db, writer, p.id, photo("a.jpg"));
    await publish(db, writer, p.id);
    expect(await deleteProject(db, editor, p.id)).toEqual({ blobPathnames: ["projects/p/a.jpg"], liveSlug: "chronicle" });
    expect(await publishedProject(db, "chronicle")).toBeNull();
  });
});

describe("Markdown files source", () => {
  it("reads project categories and technologies as refs with slugs", async () => {
    const [alpha] = await fileProjects(path.join(__dirname, "fixtures", "content", "projects"));
    expect(alpha.technologyRefs.every((t) => t.slug === t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))).toBe(true);
    expect(alpha.technologies).toEqual(alpha.technologyRefs.map((t) => t.name));
  });
});
