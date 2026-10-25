// Checks for the talk editor. Like posts, two levels: what any save needs
// (so the database accepts it), and what publishing needs (errors block,
// warnings ask first). Talks have no drafts once live, so saving a published
// talk must also pass the publish errors. Shared by the server and the editor.
import { isUpcomingTalk } from "../content/upcoming";
import { SLUG } from "./validate";

export const UPCOMING_CHOICES = ["auto", "upcoming", "past"] as const;
export type UpcomingChoice = (typeof UPCOMING_CHOICES)[number];

export interface TalkLinkInput {
  label: string;
  url: string;
}

export interface TalkInput {
  title: string;
  slug: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** Optional free text; empty means none. */
  venue: string;
  format: string;
  status: string;
  /** "auto" goes by the date; the others force the group. */
  upcoming: UpcomingChoice;
  links: TalkLinkInput[];
}

export interface TalkIssue {
  field?: keyof TalkInput;
  /** Which link, for link problems. */
  link?: number;
  message: string;
}

export interface TalkCheckResult {
  errors: TalkIssue[];
  warnings: TalkIssue[];
}

export const MAX_LINKS = 6;
/** Labels the editor suggests; any short label is fine. */
export const LINK_LABELS = ["Slides", "Video", "Event page", "Recording", "Code", "Transcript"];
/** Talk anchors on /talks/ that would read as filters elsewhere on the site. */
const RESERVED_SLUGS = new Set(["category", "tag"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PLACEHOLDER_HOST = /(^|\.)(example\.(com|org|net)|localhost|test|invalid|example)$|^127\.|^0\.0\.0\.0$/i;

export function upcomingChoice(value: boolean | null): UpcomingChoice {
  return value === null ? "auto" : value ? "upcoming" : "past";
}

export function upcomingValue(choice: UpcomingChoice): boolean | null {
  return choice === "auto" ? null : choice === "upcoming";
}

export function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Trims every field; links keep their order (blank rows are kept so the editor doesn't lose them). */
export function cleanTalkInput(input: TalkInput): TalkInput {
  return {
    title: input.title.trim(),
    slug: input.slug.trim(),
    date: input.date.trim(),
    venue: input.venue.trim(),
    format: input.format.trim(),
    status: input.status.trim(),
    upcoming: input.upcoming,
    links: input.links.map((link) => ({ label: link.label.trim(), url: link.url.trim() })),
  };
}

/** What every save needs. */
export function checkTalkDraft(input: TalkInput): TalkIssue[] {
  const errors: TalkIssue[] = [];
  if (!SLUG.test(input.slug)) {
    errors.push({ field: "slug", message: "Use lowercase words separated by hyphens, e.g. my-talk." });
  } else if (RESERVED_SLUGS.has(input.slug)) {
    errors.push({ field: "slug", message: `"${input.slug}" is reserved. Choose another URL.` });
  }
  if (!isCalendarDate(input.date)) errors.push({ field: "date", message: "Pick a valid date." });
  if (input.title.length > 200) errors.push({ field: "title", message: "Keep the title under 200 characters." });
  for (const field of ["venue", "format", "status"] as const) {
    if (input[field].length > 200) errors.push({ field, message: `Keep the ${field} under 200 characters.` });
  }
  if (!(UPCOMING_CHOICES as readonly string[]).includes(input.upcoming)) {
    errors.push({ field: "upcoming", message: "Choose automatic, upcoming, or past." });
  }
  if (input.links.length > MAX_LINKS) errors.push({ field: "links", message: `Up to ${MAX_LINKS} links.` });
  input.links.forEach((link, i) => {
    if (link.label.length > 40) errors.push({ field: "links", link: i, message: `Link ${i + 1}: keep the label under 40 characters.` });
    if (link.url.length > 2000) errors.push({ field: "links", link: i, message: `Link ${i + 1}: the URL is too long.` });
  });
  return errors;
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** Everything publishing checks (and saving a live talk). `now` decides whether the override disagrees with the date. */
export function checkTalkForPublish(input: TalkInput, now: Date = new Date()): TalkCheckResult {
  const errors = checkTalkDraft(input);
  const warnings: TalkIssue[] = [];

  if (!input.title) errors.push({ field: "title", message: "Add a title." });
  else if (input.title.length > 110) {
    warnings.push({ field: "title", message: `The title is ${input.title.length} characters; shorter reads better on the talks page.` });
  }
  if (!input.venue) warnings.push({ field: "venue", message: "No venue: the event listing shows only the title and date." });

  const seen = new Set<string>();
  input.links.forEach((link, i) => {
    const n = `Link ${i + 1}`;
    if (!link.label) errors.push({ field: "links", link: i, message: `${n}: add a label, e.g. Slides or Video.` });
    if (!link.url) return void errors.push({ field: "links", link: i, message: `${n}: add a URL.` });
    const url = parseUrl(link.url);
    if (!url) return void errors.push({ field: "links", link: i, message: `${n}: "${link.url}" isn't a full URL. Start it with https://.` });
    if (url.protocol !== "https:") {
      return void errors.push({ field: "links", link: i, message: `${n}: use an https:// link (not ${url.protocol}).` });
    }
    if (PLACEHOLDER_HOST.test(url.hostname)) {
      warnings.push({ field: "links", link: i, message: `${n}: ${url.hostname} looks like a placeholder.` });
    }
    if (seen.has(url.href)) warnings.push({ field: "links", link: i, message: `${n}: the same URL is linked twice.` });
    seen.add(url.href);
  });

  if (isCalendarDate(input.date) && input.upcoming !== "auto") {
    const byDate = isUpcomingTalk({ date: input.date }, now);
    if (input.upcoming === "upcoming" && !byDate) {
      warnings.push({ field: "upcoming", message: "It's marked upcoming, but its date has passed." });
    } else if (input.upcoming === "past" && byDate) {
      warnings.push({ field: "upcoming", message: "It's marked past, but its date is still ahead." });
    }
  }

  return { errors, warnings };
}
