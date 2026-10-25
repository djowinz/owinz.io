// Content checks for the editor, ported from scripts/validate-content.mjs.
// Two levels: what any save needs (so the database accepts it — a half-written
// draft is fine), and what publishing needs (errors block, warnings advise).
import { isLocalImage, splitPlacement } from "../rehype-images";
import { IMAGE_TYPES } from "../image-types";

export interface PostInput {
  title: string;
  slug: string;
  excerpt: string;
  /** A writing category's id (lib/cms/taxonomy.ts). */
  categoryId: string | null;
  /** Writing tag ids, in display order. */
  tagIds: string[];
  /** "YYYY-MM-DD" */
  date: string;
  updated: string | null;
  byline: string | null;
  body: string;
}

export interface Issue {
  field?: keyof PostInput;
  message: string;
}

export interface CheckResult {
  errors: Issue[];
  warnings: Issue[];
}

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Post URLs that would collide with /writing/category/… and /writing/tag/…. */
const RESERVED_SLUGS = new Set(["category", "tag"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PLACEHOLDER = /(example\.(com|org)|localhost|\/(username|your-?name|todo)(\/|$))/i;

/** "The Art of Debugging!" → "the-art-of-debugging" */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

function validDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** What every save needs; anything else can wait until publishing. */
export function checkPostDraft(input: PostInput): Issue[] {
  const errors: Issue[] = [];
  if (!SLUG.test(input.slug)) {
    errors.push({ field: "slug", message: "Use lowercase words separated by hyphens, e.g. my-first-post." });
  } else if (RESERVED_SLUGS.has(input.slug)) {
    errors.push({ field: "slug", message: `/writing/${input.slug}/ is reserved for the archive filters. Choose another URL.` });
  }
  if (!validDate(input.date)) errors.push({ field: "date", message: "Pick a valid date." });
  if (input.updated && !validDate(input.updated)) errors.push({ field: "updated", message: "Pick a valid date." });
  if (input.title.length > 200) errors.push({ field: "title", message: "Keep the title under 200 characters." });
  if (input.tagIds.length > 20) {
    errors.push({ field: "tagIds", message: "Up to 20 tags." });
  }
  if (input.body.length > 200_000) errors.push({ field: "body", message: "This post is over 200,000 characters." });
  return errors;
}

interface ImageRef {
  alt: string;
  src: string;
}

export function imageRefs(markdown: string): ImageRef[] {
  const prose = markdown.replace(/```[\s\S]*?```/g, "");
  return [...prose.matchAll(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?/g)].map(([, alt, src]) => ({ alt, src }));
}

/** The post's own photos it references, by file name (placement tags removed). */
export function localPhotoNames(markdown: string): string[] {
  return imageRefs(markdown)
    .map(({ src }) => splitPlacement(decodeURIComponent(src)).path.replace(/^\.\//, ""))
    .filter((name) => isLocalImage(name) && !name.includes("#"));
}

/** Everything publishing checks. `photos` are the file names uploaded to this post. */
export function checkPostForPublish(input: PostInput, photos: ReadonlySet<string>): CheckResult {
  const errors = checkPostDraft(input);
  const warnings: Issue[] = [];

  if (!input.title.trim()) errors.push({ field: "title", message: "Add a title." });
  else if (input.title.length > 70) {
    warnings.push({ field: "title", message: `The title is ${input.title.length} characters; search results cut off around 70.` });
  }
  if (!input.body.trim()) errors.push({ field: "body", message: "The post is empty." });
  if (input.updated && validDate(input.updated) && validDate(input.date) && input.updated < input.date) {
    errors.push({ field: "updated", message: "The updated date is before the publish date." });
  }

  const excerpt = input.excerpt.trim();
  if (!excerpt) {
    warnings.push({ field: "excerpt", message: "No excerpt: search results will show the opening paragraph instead." });
  } else if (excerpt.length < 70 || excerpt.length > 170) {
    warnings.push({ field: "excerpt", message: `The excerpt is ${excerpt.length} characters; 70–170 reads best in search results.` });
  }
  if (!input.categoryId) warnings.push({ field: "categoryId", message: "No category: it powers the archive filter." });

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
    else if (!photos.has(name)) errors.push({ field: "body", message: `"${name}" isn't uploaded to this post.` });
  }

  for (const [, url] of prose.matchAll(/\]\((https?:\/\/[^)\s]+)/g)) {
    if (PLACEHOLDER.test(url)) warnings.push({ field: "body", message: `${url} looks like a placeholder link.` });
  }

  return { errors, warnings };
}
