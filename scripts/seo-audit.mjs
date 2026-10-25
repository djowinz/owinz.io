// SEO/GEO audit of the running site. Runs as the last step of `pnpm build`
// (against `next start`), and can check any deployment. Errors exit non-zero
// so a regression can't deploy.
//
//   pnpm seo:audit                         start the built app locally and audit it
//   pnpm seo:audit https://preview-url     audit a deployment
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const SITE_URL = fs
  .readFileSync(path.join(process.cwd(), "lib", "site.ts"), "utf8")
  .match(/url:\s*"([^"]+)"/)[1]
  .replace(/\/$/, "");

const problems = [];
const report = (level, where, message) => problems.push({ level, where, message });

// --- server ------------------------------------------------------------------
async function freePort() {
  return new Promise((resolve) => {
    const server = net.createServer().listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function startServer() {
  const port = await freePort();
  const next = path.join(process.cwd(), "node_modules", ".bin", "next");
  const child = spawn(next, ["start", "-p", String(port)], { stdio: ["ignore", "ignore", "inherit"] });
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(base + "/robots.txt")).ok) return { base, stop: () => child.kill() };
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error("seo audit: `next start` did not come up within 60s — run `next build` first");
}

// --- fetching ------------------------------------------------------------------
let BASE;
const responses = new Map();
const TEXT = /text|xml|json|javascript|manifest/;

/** GET once per path; resolves to { status, type, text }. */
function get(urlPath) {
  if (!responses.has(urlPath)) {
    responses.set(
      urlPath,
      fetch(BASE + urlPath, { redirect: "follow" })
        .then(async (res) => {
          const type = res.headers.get("content-type") ?? "";
          const text = TEXT.test(type) ? await res.text() : (await res.arrayBuffer(), "");
          return { status: res.status, type, text };
        })
        .catch((err) => ({ status: 0, type: "", text: "", error: err.message })),
    );
  }
  return responses.get(urlPath);
}

async function inBatches(items, size, fn) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const metaContent = (head, key) => {
  const tag = head.match(new RegExp(`<meta[^>]+(?:name|property)="${key}"[^>]*>`))?.[0];
  return tag ? attr(tag, "content") : undefined;
};
const isNoindex = (html) => /<meta name="robots" content="[^"]*noindex/.test(html);
const decode = (s) => s.replace(/&amp;/g, "&");
const sitePath = (url) => (url.startsWith(SITE_URL) ? url.slice(SITE_URL.length) || "/" : null);
// Strip non-JSON-LD scripts: the RSC payload repeats markup as strings.
const visibleHtml = (html) => html.replace(/<script(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/g, "");

// --- audit ---------------------------------------------------------------------
async function audit() {
  const sitemap = await get("/sitemap.xml");
  if (sitemap.status !== 200) report("error", "/sitemap.xml", `HTTP ${sitemap.status || sitemap.error}`);
  const listedPaths = new Set();
  for (const [, url] of sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const p = sitePath(url);
    if (p) listedPaths.add(p);
    else report("error", "/sitemap.xml", `lists a URL outside ${SITE_URL}: ${url}`);
  }

  // Pages: everything in the sitemap, plus every page they link to.
  const queue = [...new Set(["/", ...listedPaths])];
  const seen = new Set(queue);
  const pages = [];
  const state = { titles: new Map(), descriptions: new Map(), assets: new Map() };

  while (queue.length) {
    await Promise.all(
      queue.splice(0, 8).map(async (urlPath) => {
        const res = await get(urlPath);
        if (res.status !== 200) {
          report("error", urlPath, `HTTP ${res.status || res.error}`);
          return;
        }
        if (!res.type.includes("text/html")) return;
        if (isNoindex(res.text)) {
          if (listedPaths.has(urlPath)) report("error", "/sitemap.xml", `lists a noindex page: ${urlPath}`);
          return;
        }
        pages.push(urlPath);
        if (!listedPaths.has(urlPath)) report("error", "/sitemap.xml", `missing ${urlPath}`);
        checkPage(urlPath, res.text, state);

        for (const [, rawHref] of visibleHtml(res.text).matchAll(/<a\b[^>]*\shref="(\/(?!\/)[^"#]*)/g)) {
          const href = decode(rawHref).split("?")[0];
          if (/\.[a-z0-9]+$/i.test(href)) state.assets.set(href, { where: urlPath, kind: "link" });
          else if (!seen.has(href)) {
            seen.add(href);
            queue.push(href);
          }
        }
      }),
    );
  }

  await inBatches([...state.assets], 8, async ([assetPath, { where, kind }]) => {
    const res = await get(assetPath);
    if (res.status !== 200) report("error", where, `${kind} ${assetPath} → HTTP ${res.status || res.error}`);
    else if (kind !== "link" && !res.type.startsWith("image/")) {
      report("error", where, `${kind} ${assetPath} is served as ${res.type || "no Content-Type"}, not an image`);
    }
  });

  // Crawler files, with the Content-Type each must be served as.
  const files = {
    "/robots.txt": "text/plain",
    "/llms.txt": "text/plain",
    "/llms-full.txt": "text/plain",
    "/feed.xml": "xml",
    "/favicon.ico": "icon", // image/x-icon or image/vnd.microsoft.icon
    "/manifest.webmanifest": "application/manifest+json",
  };
  for (const [file, type] of Object.entries(files)) {
    const res = await get(file);
    if (res.status !== 200) report("error", file, `HTTP ${res.status || res.error}`);
    else if (!res.type.includes(type)) report("error", file, `served as ${res.type}, expected ${type}`);
  }
  const robots = (await get("/robots.txt")).text;
  if (!robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`)) report("error", "/robots.txt", "does not reference the sitemap");
  if (/^Disallow:\s*\/\s*$/m.test(robots)) report("error", "/robots.txt", "disallows the whole site");

  const missing = await get("/__seo-audit-missing__/");
  if (missing.status !== 404) report("error", "404 page", `unknown URL returned HTTP ${missing.status}`);
  if (!isNoindex(missing.text)) report("error", "404 page", "should be noindex");
  if (/<link rel="canonical"/.test(missing.text)) report("error", "404 page", "should not declare a canonical URL");

  return pages;
}

function checkPage(where, html, { titles, descriptions, assets }) {
  const head = html.slice(0, html.indexOf("</head>"));
  const visible = visibleHtml(html);

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
  else if (canonical !== `${SITE_URL}${where}`) report("error", where, `canonical is ${canonical}, expected ${SITE_URL}${where}`);

  for (const key of ["og:title", "og:description", "og:url", "og:image", "og:type", "twitter:card"]) {
    if (!metaContent(head, key)) report("error", where, `missing ${key}`);
  }
  const ogImage = metaContent(head, "og:image");
  if (ogImage) {
    const p = sitePath(decode(ogImage));
    if (p) assets.set(p, { where, kind: "og:image" });
    else report("error", where, `og:image is not on ${SITE_URL}: ${ogImage}`);
  }

  const h1s = visible.match(/<h1[\s>]/g)?.length ?? 0;
  if (h1s !== 1) report("error", where, `expected exactly one <h1>, found ${h1s}`);

  for (const img of visible.match(/<img\b[^>]*>/g) ?? []) {
    const src = attr(img, "src");
    if (attr(img, "alt") === undefined) report("error", where, `<img> without alt: ${src}`);
    if (src?.startsWith("/") && !src.startsWith("//")) assets.set(decode(src), { where, kind: "image" });
  }

  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (!blocks.length) report("warn", where, "no JSON-LD structured data");
  for (const [, json] of blocks) {
    try {
      for (const item of [JSON.parse(json)].flat()) {
        if (item["@context"] !== "https://schema.org") report("error", where, "JSON-LD block without @context https://schema.org");
      }
    } catch (err) {
      report("error", where, `JSON-LD does not parse: ${err.message}`);
    }
  }
}

// --- run -------------------------------------------------------------------------
const target = process.argv[2];
const server = target ? null : await startServer();
BASE = (target ?? server.base).replace(/\/$/, "");

let pages = [];
try {
  pages = await audit();
} finally {
  server?.stop();
}

const errors = problems.filter((p) => p.level === "error");
const warnings = problems.filter((p) => p.level === "warn");
for (const p of [...errors, ...warnings]) {
  console.log(`${p.level === "error" ? "✖ error" : "⚠ warn "}  ${p.where}: ${p.message}`);
}
console.log(`\nseo audit (${BASE}): ${pages.length} pages — ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
