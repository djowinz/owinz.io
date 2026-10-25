// Post-build SEO/GEO audit of the static export in out/. Runs as the last
// step of `pnpm build`; errors exit non-zero so a regression can't deploy.
//
//   pnpm seo:audit                 (after `next build`)
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] ?? "out");
const SITE_URL = fs
  .readFileSync(path.join(process.cwd(), "lib", "site.ts"), "utf8")
  .match(/url:\s*"([^"]+)"/)[1]
  .replace(/\/$/, "");

const problems = [];
const report = (level, where, message) => problems.push({ level, where, message });

if (!fs.existsSync(OUT)) {
  console.error(`seo audit: ${OUT} not found — run \`next build\` first`);
  process.exit(1);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "_next" ? [] : walk(full);
    return [full];
  });
}

/** "/writing/foo/" → out/writing/foo/index.html; "/feed.xml" → out/feed.xml */
function outFileFor(urlPath) {
  const clean = decodeURI(urlPath.split(/[?#]/)[0]);
  if (clean.endsWith("/")) return path.join(OUT, clean, "index.html");
  return path.join(OUT, clean);
}

const attr = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];
const metaContent = (head, key) => {
  const tag = head.match(new RegExp(`<meta[^>]+(?:name|property)="${key}"[^>]*>`))?.[0];
  return tag ? attr(tag, "content") : undefined;
};

const isNoindex = (html) => /<meta name="robots" content="[^"]*noindex/.test(html);

// Indexable pages only; noindex pages (the 404 and its /404/ twin) are
// checked separately below.
const pages = walk(OUT)
  .filter((f) => f.endsWith("index.html") && !f.includes(`${path.sep}_not-found${path.sep}`))
  .filter((f) => !isNoindex(fs.readFileSync(f, "utf8")))
  .map((file) => {
    const rel = path.relative(OUT, path.dirname(file)).split(path.sep).join("/");
    return { file, urlPath: rel ? `/${rel}/` : "/" };
  });

const titles = new Map();
const descriptions = new Map();

for (const { file, urlPath } of pages) {
  const html = fs.readFileSync(file, "utf8");
  const head = html.slice(0, html.indexOf("</head>"));
  // Strip non-JSON-LD scripts: the RSC payload repeats markup as strings.
  const visible = html.replace(/<script(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/g, "");
  const where = urlPath;

  if (!/<html[^>]+lang="[a-z-]+"/i.test(html)) report("error", where, "<html> has no lang attribute");

  const title = head.match(/<title>([^<]*)<\/title>/)?.[1];
  if (!title) report("error", where, "missing <title>");
  else {
    if (title.length > 70) report("warn", where, `title is ${title.length} chars (search results truncate ~60–70)`);
    if (titles.has(title)) report("error", where, `duplicate title (also on ${titles.get(title)})`);
    titles.set(title, where);
  }

  const description = metaContent(head, "description");
  if (!description) report("error", where, "missing meta description");
  else {
    if (description.length < 50 || description.length > 170) {
      report("warn", where, `meta description is ${description.length} chars (aim for 50–170)`);
    }
    if (descriptions.has(description)) report("warn", where, `duplicate meta description (also on ${descriptions.get(description)})`);
    descriptions.set(description, where);
  }

  const canonical = head.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  if (!canonical) report("error", where, "missing canonical link");
  else if (canonical !== `${SITE_URL}${urlPath}`) {
    report("error", where, `canonical is ${canonical}, expected ${SITE_URL}${urlPath}`);
  }

  for (const key of ["og:title", "og:description", "og:url", "og:image", "og:type", "twitter:card"]) {
    if (!metaContent(head, key)) report("error", where, `missing ${key}`);
  }
  const ogImage = metaContent(head, "og:image");
  if (ogImage) {
    if (!ogImage.startsWith(SITE_URL)) report("error", where, `og:image is not on ${SITE_URL}: ${ogImage}`);
    else if (!fs.existsSync(outFileFor(ogImage.slice(SITE_URL.length)))) {
      report("error", where, `og:image file was not exported: ${ogImage}`);
    } else if (!/\.(png|jpe?g|webp|gif)$/i.test(ogImage)) {
      report("error", where, `og:image has no image extension (static hosts will serve the wrong Content-Type): ${ogImage}`);
    }
  }

  const h1s = visible.match(/<h1[\s>]/g)?.length ?? 0;
  if (h1s !== 1) report("error", where, `expected exactly one <h1>, found ${h1s}`);

  for (const img of visible.match(/<img\b[^>]*>/g) ?? []) {
    if (attr(img, "alt") === undefined) report("error", where, `<img> without alt: ${attr(img, "src")}`);
  }

  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (!blocks.length) report("warn", where, "no JSON-LD structured data");
  for (const [, json] of blocks) {
    try {
      const data = JSON.parse(json);
      for (const item of [data].flat()) {
        if (item["@context"] !== "https://schema.org") report("error", where, "JSON-LD block without @context https://schema.org");
      }
    } catch (err) {
      report("error", where, `JSON-LD does not parse: ${err.message}`);
    }
  }

  // Internal links must resolve to an exported file.
  for (const [, href] of visible.matchAll(/<a\b[^>]*\shref="(\/[^"]*)"/g)) {
    if (href.startsWith("//")) continue;
    if (!fs.existsSync(outFileFor(href))) report("error", where, `broken internal link: ${href}`);
  }
}

// --- crawler files -----------------------------------------------------------
const read = (name) => (fs.existsSync(path.join(OUT, name)) ? fs.readFileSync(path.join(OUT, name), "utf8") : null);

const sitemap = read("sitemap.xml");
if (!sitemap) report("error", "/sitemap.xml", "not exported");
else {
  const listed = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  for (const { urlPath } of pages) {
    if (!listed.has(`${SITE_URL}${urlPath}`)) report("error", "/sitemap.xml", `missing ${urlPath}`);
  }
  for (const url of listed) {
    if (!url.startsWith(SITE_URL) || !fs.existsSync(outFileFor(url.slice(SITE_URL.length)))) {
      report("error", "/sitemap.xml", `lists a page that was not exported: ${url}`);
    }
  }
}

const robots = read("robots.txt");
if (!robots) report("error", "/robots.txt", "not exported");
else {
  if (!robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`)) report("error", "/robots.txt", "does not reference the sitemap");
  if (/^Disallow:\s*\/\s*$/m.test(robots)) report("error", "/robots.txt", "disallows the whole site");
}

for (const name of ["llms.txt", "llms-full.txt", "feed.xml", "favicon.ico", "manifest.webmanifest"]) {
  if (!read(name)) report("error", `/${name}`, "not exported");
}

const notFound = read("404.html");
if (!notFound) report("warn", "/404.html", "not exported");
else {
  if (!isNoindex(notFound)) report("error", "/404.html", "should be noindex");
  if (/<link rel="canonical"/.test(notFound)) report("error", "/404.html", "should not declare a canonical URL");
}

// --- report ------------------------------------------------------------------
const errors = problems.filter((p) => p.level === "error");
const warnings = problems.filter((p) => p.level === "warn");
for (const p of [...errors, ...warnings]) {
  console.log(`${p.level === "error" ? "✖ error" : "⚠ warn "}  ${p.where}: ${p.message}`);
}
console.log(`\nseo audit: ${pages.length} pages — ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
