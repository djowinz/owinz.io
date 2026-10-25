// Pre-build content check: validates frontmatter in content/ so a typo'd
// date or missing title fails the build instead of shipping bad SEO.
// Errors exit non-zero; warnings are advisory.
//
//   pnpm content:check            (also runs as the first step of `pnpm build`)
//   node scripts/validate-content.mjs [contentDir]
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const ROOT = path.resolve(process.argv[2] ?? path.join(process.cwd(), "content"));
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLACEHOLDER_HOSTS = ["example.com", "example.org", "localhost"];

const problems = [];
const report = (level, file, message) => problems.push({ level, file, message });

const isDate = (value) =>
  (typeof value === "string" || value instanceof Date) &&
  !Number.isNaN(new Date(value).getTime());

function checkUrl(file, field, value) {
  if (value === undefined) return;
  let url;
  try {
    url = new URL(value);
  } catch {
    return report("error", file, `\`${field}\` is not a valid URL: ${value}`);
  }
  if (!/^https?:$/.test(url.protocol)) report("error", file, `\`${field}\` must be http(s): ${value}`);
  else if (url.protocol === "http:") report("warn", file, `\`${field}\` uses http — prefer https: ${value}`);
  if (PLACEHOLDER_HOSTS.includes(url.hostname) || /\/(username|your-?name|todo)(\/|$)/i.test(url.pathname)) {
    report("warn", file, `\`${field}\` looks like a placeholder: ${value}`);
  }
}

function checkLength(file, field, value, { min, max }) {
  if (typeof value !== "string" || !value) return;
  if (value.length < min) report("warn", file, `\`${field}\` is short (${value.length} chars; aim for ${min}–${max}) — search snippets may be rewritten`);
  if (value.length > max) report("warn", file, `\`${field}\` is ${value.length} chars; search results truncate around ${max}`);
}

function checkStringList(file, field, value) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    report("error", file, `\`${field}\` must be a list of strings`);
  }
}

function checkBody(file, body) {
  if (/^#\s/m.test(body.replace(/```[\s\S]*?```/g, ""))) {
    report("warn", file, "body contains a `# ` heading — the page title is already the <h1>; use `##` for sections");
  }
  for (const [, alt, src] of body.matchAll(/!\[([^\]]*)\]\(([^)\s]+)/g)) {
    if (!alt.trim()) report("warn", file, `image has no alt text: ${src}`);
  }
}

function files(collection) {
  const dir = path.join(ROOT, collection);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => {
      const file = path.join(collection, name);
      const slug = name.replace(/\.md$/, "");
      let parsed;
      try {
        parsed = matter(fs.readFileSync(path.join(dir, name), "utf8"));
      } catch (err) {
        report("error", file, `frontmatter does not parse: ${err.message}`);
        return null;
      }
      if (!SLUG.test(slug)) {
        report("error", file, `file name becomes the URL slug; use lowercase-words-with-hyphens (got "${slug}")`);
      }
      return { file, slug, data: parsed.data, body: parsed.content };
    })
    .filter(Boolean);
}

function checkDuplicateTitles(entries) {
  const seen = new Map();
  for (const { file, data } of entries) {
    const key = String(data.title ?? "").trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) report("warn", file, `same title as ${seen.get(key)} — titles should be unique for search`);
    else seen.set(key, file);
  }
}

// --- writing ---------------------------------------------------------------
const writing = files("writing");
for (const { file, data, body } of writing) {
  if (!data.title) report("error", file, "missing `title`");
  checkLength(file, "title", data.title, { min: 10, max: 70 });
  if (!data.date) report("error", file, "missing `date` (e.g. date: \"March 15, 2026\")");
  else if (!isDate(data.date)) report("error", file, `\`date\` is not a valid date: ${data.date}`);
  if (data.updated !== undefined && !isDate(data.updated)) report("error", file, `\`updated\` is not a valid date: ${data.updated}`);
  if (isDate(data.date) && isDate(data.updated) && new Date(data.updated) < new Date(data.date)) {
    report("error", file, "`updated` is earlier than `date`");
  }
  if (!data.excerpt) report("warn", file, "no `excerpt` — the description will be generated from the first paragraph");
  checkLength(file, "excerpt", data.excerpt, { min: 70, max: 170 });
  if (!data.category) report("warn", file, "no `category` — it powers the archive filter and article:section");
  checkStringList(file, "tags", data.tags);
  checkBody(file, body);
}
checkDuplicateTitles(writing);

// --- projects --------------------------------------------------------------
const projects = files("projects");
for (const { file, data, body } of projects) {
  if (!data.title) report("error", file, "missing `title`");
  if (!data.description) report("warn", file, "no `description` — it will be generated from the first paragraph");
  checkLength(file, "description", data.description, { min: 70, max: 170 });
  if (data.launchDate === undefined) report("warn", file, "no `launchDate` — the project will have no year and sort last on the home page");
  else if (!isDate(data.launchDate)) report("error", file, `\`launchDate\` is not a valid date: ${data.launchDate}`);
  if (data.updated !== undefined && !isDate(data.updated)) report("error", file, `\`updated\` is not a valid date: ${data.updated}`);
  if (data.order !== undefined && typeof data.order !== "number") report("error", file, "`order` must be a number");
  checkStringList(file, "technologies", data.technologies);
  checkUrl(file, "liveUrl", data.liveUrl);
  checkUrl(file, "sourceUrl", data.sourceUrl);
  if (data.image !== undefined && !String(data.image).startsWith("/")) {
    checkUrl(file, "image", data.image);
  }
  checkBody(file, body);
}
checkDuplicateTitles(projects);

// --- talks -----------------------------------------------------------------
for (const { file, data } of files("talks")) {
  if (!data.title) report("error", file, "missing `title`");
  if (!data.date) report("error", file, "missing `date`");
  else if (!isDate(data.date)) report("error", file, `\`date\` is not a valid date: ${data.date}`);
  if (!data.venue) report("warn", file, "no `venue` — talk structured data will have no location");
  if (data.links !== undefined) {
    if (typeof data.links !== "object" || Array.isArray(data.links)) {
      report("error", file, "`links` must be a map, e.g. `links: { slides: https://… }`");
    } else {
      for (const [label, url] of Object.entries(data.links)) checkUrl(file, `links.${label}`, url);
    }
  }
}

// --- report ----------------------------------------------------------------
const errors = problems.filter((p) => p.level === "error");
const warnings = problems.filter((p) => p.level === "warn");
for (const p of [...errors, ...warnings]) {
  const where = path.relative(process.cwd(), path.join(ROOT, p.file));
  console.log(`${p.level === "error" ? "✖ error" : "⚠ warn "}  ${where}: ${p.message}`);
}
console.log(
  `\ncontent check: ${writing.length} writing, ${projects.length} projects — ${errors.length} error(s), ${warnings.length} warning(s)`,
);
process.exit(errors.length ? 1 : 0);
