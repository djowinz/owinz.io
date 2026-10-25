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
// Keep in sync with IMAGE_TYPES in lib/images.ts.
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".svg"];
const PUBLIC = path.join(process.cwd(), "public");

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

const isLocal = (src) => !/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(src);

// `photos` is the post's folder for folder-style writing posts, where
// relative image paths resolve; otherwise relative paths have nowhere to go.
function checkImages(file, body, { photos, slug, allowFolders }) {
  const used = new Set();
  const prose = body.replace(/```[\s\S]*?```/g, "");
  for (const [, alt, rawSrc] of prose.matchAll(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?/g)) {
    const [, path_, fragment] = decodeURIComponent(rawSrc).match(/^([^#]*)(?:#(.*))?$/);
    const src = path_ || rawSrc;
    if (fragment !== undefined && !["left", "right"].includes(fragment)) {
      report("error", file, `"${rawSrc}": unknown placement "#${fragment}" — use #left or #right (or nothing, to center)`);
    }
    if (!alt.trim()) report("warn", file, `image has no alt text (describe it for screen readers and search): ${src}`);

    if (!isLocal(src)) {
      if (src.startsWith("/") && !fs.existsSync(path.join(PUBLIC, src))) {
        report("error", file, `image not found: public${src}`);
      }
      continue;
    }
    if (!photos) {
      report(
        "error",
        file,
        allowFolders
          ? `"${src}" is a relative path, but this post is a single file. Move it to writing/${slug}/index.md and put ${path.basename(src)} beside it`
          : `"${src}" is a relative path; put the file in public/ and reference it as /${path.basename(src)}`,
      );
      continue;
    }
    const name = src.replace(/^\.\//, "");
    const ext = path.extname(name).toLowerCase();
    if (name.includes("/")) report("error", file, `"${src}": photos must sit directly in the post folder, not a subfolder`);
    else if (name === "og.png") report("error", file, "\"og.png\" is reserved for the generated social card; rename the photo");
    else if (ext === ".heic" || ext === ".heif") report("error", file, `"${name}": browsers can't display HEIC; export it as JPEG (on iPhone: Settings → Camera → Formats → Most Compatible)`);
    else if (!IMAGE_EXTENSIONS.includes(ext)) report("error", file, `"${name}": unsupported image type (use ${IMAGE_EXTENSIONS.join(", ")})`);
    else if (!fs.existsSync(path.join(photos, name))) report("error", file, `image not found: ${path.relative(ROOT, path.join(photos, name))}`);
    else {
      used.add(name);
      if (!/^[a-z0-9._-]+$/.test(name)) report("warn", file, `"${name}": prefer lowercase-with-hyphens file names (URLs are case-sensitive)`);
    }
  }

  if (photos) {
    for (const name of fs.readdirSync(photos)) {
      if (IMAGE_EXTENSIONS.includes(path.extname(name).toLowerCase()) && !used.has(name)) {
        report("warn", file, `${name} isn't referenced in the post, so it won't be published`);
      }
    }
  }
}

function checkBody(file, body, images) {
  if (/^#\s/m.test(body.replace(/```[\s\S]*?```/g, ""))) {
    report("warn", file, "body contains a `# ` heading — the page title is already the <h1>; use `##` for sections");
  }
  checkImages(file, body, images);
}

// `<slug>.md` files, plus `<slug>/index.md` folders when the collection
// supports photos beside the post.
function files(collection, { folders = false } = {}) {
  const dir = path.join(ROOT, collection);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .map((entry) => {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        return { name: entry.name, slug: entry.name.replace(/\.md$/, "") };
      }
      if (folders && entry.isDirectory()) {
        const index = path.join(entry.name, "index.md");
        if (fs.existsSync(path.join(dir, index))) {
          return { name: index, slug: entry.name, photos: path.join(dir, entry.name) };
        }
        report("warn", path.join(collection, entry.name), "folder has no index.md, so it isn't a post");
      }
      return null;
    })
    .filter(Boolean)
    .map(({ name, slug, photos }) => {
      const file = path.join(collection, name);
      let parsed;
      try {
        parsed = matter(fs.readFileSync(path.join(dir, name), "utf8"));
      } catch (err) {
        report("error", file, `frontmatter does not parse: ${err.message}`);
        return null;
      }
      if (!SLUG.test(slug)) {
        report("error", file, `the ${photos ? "folder" : "file"} name becomes the URL slug; use lowercase-words-with-hyphens (got "${slug}")`);
      }
      return { file, slug, photos, data: parsed.data, body: parsed.content };
    })
    .filter(Boolean);
}

function checkSlugCollisions(entries) {
  const seen = new Map();
  for (const { file, slug } of entries) {
    if (seen.has(slug)) report("error", file, `same URL slug as ${seen.get(slug)}`);
    else seen.set(slug, file);
  }
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
const writing = files("writing", { folders: true });
checkSlugCollisions(writing);
for (const { file, slug, photos, data, body } of writing) {
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
  checkBody(file, body, { photos, slug, allowFolders: true });
}
checkDuplicateTitles(writing);

// --- projects --------------------------------------------------------------
const projects = files("projects");
for (const { file, slug, data, body } of projects) {
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
  checkBody(file, body, { slug, allowFolders: false });
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
