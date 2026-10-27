// Content checks for the project editor, the project counterpart of
// validate.ts: what any save needs, and what publishing needs (errors
// block, warnings advise).
import { isLocalImage, splitPlacement } from "../rehype-images";
import { IMAGE_TYPES } from "../image-types";
import { chartIssues } from "../charts/check";
import { imageRefs, SLUG } from "./validate";

export interface ProjectInput {
  title: string;
  slug: string;
  /** Dek on the page and the meta description. */
  description: string;
  purpose: string;
  challenge: string;
  /** A projects category's id (lib/cms/taxonomy.ts). */
  categoryId: string | null;
  /** Projects tag ids ("Technologies"), in display order. */
  technologyIds: string[];
  role: string | null;
  /** Free-text status shown on the page, e.g. "Shipped · v1.3". */
  projectStatus: string | null;
  platform: string | null;
  /** "YYYY-MM-DD" */
  launchDate: string | null;
  updated: string | null;
  liveUrl: string | null;
  sourceUrl: string | null;
  /** Cover image: the file name of one of the project's photos (or, for older content, a URL). */
  image: string | null;
  body: string;
}

export interface ProjectIssue {
  field?: keyof ProjectInput;
  message: string;
}

export interface ProjectCheckResult {
  errors: ProjectIssue[];
  warnings: ProjectIssue[];
}

/** Project URLs that would collide with /projects/category/… and /projects/technology/…. */
const RESERVED_SLUGS = new Set(["category", "technology"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PLACEHOLDER = /(example\.(com|org)|localhost|\/(username|your-?name|todo)(\/|$))/i;
const MAX_TECHNOLOGIES = 20;
const SHORT_FIELDS = ["role", "projectStatus", "platform"] as const;

function validDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function httpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

/** What every save needs; anything else can wait until publishing. */
export function checkProjectDraft(input: ProjectInput): ProjectIssue[] {
  const errors: ProjectIssue[] = [];
  if (!SLUG.test(input.slug)) {
    errors.push({ field: "slug", message: "Use lowercase words separated by hyphens, e.g. my-project." });
  } else if (RESERVED_SLUGS.has(input.slug)) {
    errors.push({ field: "slug", message: `/projects/${input.slug}/ is reserved for the project filters. Choose another URL.` });
  }
  if (input.title.length > 200) errors.push({ field: "title", message: "Keep the title under 200 characters." });
  for (const field of ["description", "purpose", "challenge"] as const) {
    if (input[field].length > 1000) errors.push({ field, message: `Keep the ${field} under 1,000 characters.` });
  }
  for (const field of SHORT_FIELDS) {
    if ((input[field]?.length ?? 0) > 120) errors.push({ field, message: "Keep it under 120 characters." });
  }
  for (const field of ["launchDate", "updated"] as const) {
    const value = input[field];
    if (value && !validDate(value)) errors.push({ field, message: "Pick a valid date." });
  }
  for (const field of ["liveUrl", "sourceUrl"] as const) {
    const value = input[field];
    if (value && !httpUrl(value)) errors.push({ field, message: "Use a full http(s) address, e.g. https://example.app." });
  }
  if (input.image && input.image.length > 500) errors.push({ field: "image", message: "That cover image reference is too long." });
  if (input.technologyIds.length > MAX_TECHNOLOGIES) {
    errors.push({ field: "technologyIds", message: `Up to ${MAX_TECHNOLOGIES} technologies.` });
  }
  if (input.body.length > 200_000) errors.push({ field: "body", message: "This case study is over 200,000 characters." });
  return errors;
}

/** Everything publishing checks. `photos` are the file names uploaded to this project. */
export function checkProjectForPublish(input: ProjectInput, photos: ReadonlySet<string>): ProjectCheckResult {
  const errors = checkProjectDraft(input);
  const warnings: ProjectIssue[] = [];

  if (!input.title.trim()) errors.push({ field: "title", message: "Add a title." });
  else if (input.title.length > 70) {
    warnings.push({ field: "title", message: `The title is ${input.title.length} characters; search results cut off around 70.` });
  }
  if (!input.body.trim()) errors.push({ field: "body", message: "The case study is empty." });
  if (
    input.updated && input.launchDate && validDate(input.updated) && validDate(input.launchDate) &&
    input.updated < input.launchDate
  ) {
    errors.push({ field: "updated", message: "The updated date is before the launch date." });
  }

  const description = input.description.trim();
  if (!description) {
    warnings.push({ field: "description", message: "No description: search results will show the opening paragraph instead." });
  } else if (description.length < 70 || description.length > 170) {
    warnings.push({ field: "description", message: `The description is ${description.length} characters; 70–170 reads best in search results.` });
  }
  if (!input.categoryId) warnings.push({ field: "categoryId", message: "No category: it powers the /projects filter." });
  if (input.technologyIds.length === 0) warnings.push({ field: "technologyIds", message: "No technologies: the page's stack list will be empty." });
  if (!input.launchDate) warnings.push({ field: "launchDate", message: "No launch date: the project shows no year." });

  for (const field of ["liveUrl", "sourceUrl"] as const) {
    const url = input[field] ? httpUrl(input[field]!) : null;
    if (!url) continue;
    if (url.protocol === "http:") warnings.push({ field, message: `${url.href} uses http — prefer https.` });
    if (PLACEHOLDER.test(url.href)) warnings.push({ field, message: `${url.href} looks like a placeholder link.` });
  }

  const cover = input.image?.trim();
  if (!cover) {
    warnings.push({ field: "image", message: "No cover image: the page shows its title in the figure panel instead." });
  } else if (isLocalImage(cover)) {
    const name = cover.replace(/^\.\//, "");
    if (!photos.has(name)) errors.push({ field: "image", message: `The cover image "${name}" isn't uploaded to this project.` });
  } else if (!cover.startsWith("/") && !httpUrl(cover)) {
    errors.push({ field: "image", message: "The cover image must be one of the project's photos." });
  }

  const prose = input.body.replace(/```[\s\S]*?```/g, "");
  if (/^#\s/m.test(prose)) {
    warnings.push({ field: "body", message: "The title is already the page heading; start sections at ## instead of #." });
  }

  for (const { alt, src: raw } of imageRefs(input.body)) {
    const src = decodeURIComponent(raw);
    const fragment = src.match(/#([^#]*)$/)?.[1];
    if (fragment !== undefined && fragment !== "left" && fragment !== "right") {
      errors.push({ field: "body", message: `"${raw}": unknown placement #${fragment} — use #left or #right.` });
    }
    const { path } = splitPlacement(src);
    if (!alt.trim()) warnings.push({ field: "body", message: `An image has no alt text (${path}). Describe it for screen readers and search.` });
    if (!isLocalImage(path)) {
      if (path.startsWith("http://")) warnings.push({ field: "body", message: `${path} uses http — prefer https.` });
      continue;
    }
    const name = path.replace(/^\.\//, "");
    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
    if (name.includes("/")) errors.push({ field: "body", message: `"${path}": photos are referenced by file name only.` });
    else if (!(ext in IMAGE_TYPES)) errors.push({ field: "body", message: `"${name}" isn't a supported image type.` });
    else if (!photos.has(name)) errors.push({ field: "body", message: `"${name}" isn't uploaded to this project.` });
  }

  for (const [, url] of prose.matchAll(/\]\((https?:\/\/[^)\s]+)/g)) {
    if (PLACEHOLDER.test(url)) warnings.push({ field: "body", message: `${url} looks like a placeholder link.` });
  }

  const charts = chartIssues(input.body);
  for (const message of charts.errors) errors.push({ field: "body", message });
  for (const message of charts.warnings) warnings.push({ field: "body", message });

  return { errors, warnings };
}
