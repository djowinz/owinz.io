// End-to-end tests: a real production build against its own Postgres
// database, driven with Playwright (Chrome).
//
//   pnpm test:e2e                     create DB → migrate → seed content/ →
//                                     next build → next start → flows → drop DB
//   pnpm test:e2e --reuse-build       skip `next build` if .next has a build
//   pnpm test:e2e --only=writing      run flow files whose name contains this
//   pnpm test:e2e --screenshots=<dir> also save screenshots (light and dark)
//   pnpm test:e2e --headed            watch it run
//
// Needs the local Postgres (pnpm db:up). The database server comes from
// E2E_DATABASE_URL, else OWINZ_IO_DATABASE_URL (env or .env.local); it must be
// local. A database named owinz_e2e_<random> is created and always dropped.
//
// Flows live in e2e/flows/*.mjs; each exports `flows`, a list of
// { name, run(ctx) } run in order (file order, then list order). ctx holds
// { base, browser, pg, sessions: { editor, writer, contributor }, state,
// screenshots, ... }; `state` is shared, so a later flow can use what an
// earlier one created. A failing flow is reported and the rest still run.
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { chromium } = require("playwright");
const pg = require("pg");
const { contextFor, mintSession } = await import("./lib.mjs");

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const flagValue = (name) => flag(name)?.split("=").slice(1).join("=") || undefined;
const reuseBuild = Boolean(flag("reuse-build"));
const only = flagValue("only");
const screenshots = flagValue("screenshots") && path.resolve(flagValue("screenshots"));
const headed = Boolean(flag("headed"));

const log = (...a) => console.log("[e2e]", ...a);

function envFile() {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
      .filter(Boolean)
      .map(([, k, v]) => [k, v.replace(/^(['"])(.*)\1$/, "$2")]),
  );
}

function freePort(from = 4300, to = 4399) {
  const tryPort = (port) =>
    new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
    });
  return (async () => {
    const start = from + Math.floor(Math.random() * (to - from));
    for (let i = 0; i <= to - from; i++) {
      const port = from + ((start - from + i) % (to - from + 1));
      if (await tryPort(port)) return port;
    }
    throw new Error(`no free port in ${from}–${to}`);
  })();
}

const fileEnv = envFile();
const serverUrl = process.env.E2E_DATABASE_URL ?? process.env.OWINZ_IO_DATABASE_URL ?? fileEnv.OWINZ_IO_DATABASE_URL;
if (!serverUrl || !/@(localhost|127\.0\.0\.1)[:/]/.test(serverUrl)) {
  console.error("[e2e] needs a local Postgres URL in E2E_DATABASE_URL or OWINZ_IO_DATABASE_URL (pnpm db:up)");
  process.exit(1);
}
const dbName = `owinz_e2e_${randomBytes(4).toString("hex")}`;
const adminUrl = new URL(serverUrl);
adminUrl.pathname = "/postgres";
const dbUrl = new URL(serverUrl);
dbUrl.pathname = `/${dbName}`;
const secret = process.env.BETTER_AUTH_SECRET ?? fileEnv.BETTER_AUTH_SECRET ?? randomBytes(32).toString("base64");

const env = {
  ...process.env,
  OWINZ_IO_DATABASE_URL: dbUrl.toString(),
  OWINZ_IO_DATABASE_URL_UNPOOLED: dbUrl.toString(),
  OWINZ_IO_BLOB_DRIVER: "local",
  OWINZ_IO_FIRST_EDITOR: "",
  OWINZ_IO_DEV_LOGIN: "",
  BETTER_AUTH_SECRET: secret,
  NEXT_TELEMETRY_DISABLED: "1",
};

const run = (cmd, cmdArgs, extra = {}) =>
  execFileSync(cmd, cmdArgs, { cwd: ROOT, env: { ...env, ...extra }, stdio: "inherit" });

let server;
let client;
let browser;
let exitCode = 1;
const results = [];

async function cleanup() {
  await browser?.close().catch(() => {});
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => (server.kill("SIGKILL"), resolve()), 5000);
      server.once("exit", () => (clearTimeout(timer), resolve()));
    });
  }
  if (client) {
    // Photos the run stored (seeded and uploaded) live in .data/blob/.
    try {
      const { rows } = await client.query("select blob_pathname from assets");
      const blobRoot = path.join(ROOT, ".data", "blob");
      for (const { blob_pathname } of rows) {
        const file = path.resolve(blobRoot, blob_pathname);
        if (file.startsWith(blobRoot + path.sep)) fs.rmSync(file, { force: true });
      }
    } catch {
      // the schema may not exist if setup failed early
    }
    await client.end().catch(() => {});
  }
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await admin.connect();
    await admin.query(`drop database if exists "${dbName}" with (force)`);
    log(`dropped ${dbName}`);
  } catch (err) {
    console.error(`[e2e] couldn't drop ${dbName}:`, err.message);
  } finally {
    await admin.end().catch(() => {});
  }
}

let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    if (interrupted) return;
    interrupted = true;
    await cleanup();
    process.exit(130);
  });
}

try {
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`create database "${dbName}"`);
  await admin.end();
  log(`created ${dbName}`);

  run(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "migrate"]);
  run(process.execPath, ["--import", "tsx", "scripts/seed-if-empty.ts"]);

  // Run Next's JS entry with node: the .bin shim is a shell script on Windows.
  const next = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  if (reuseBuild && fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
    log("reusing the existing .next build");
  } else {
    log("next build");
    run(process.execPath, [next, "build"]);
  }

  const port = await freePort();
  const base = `http://localhost:${port}`;
  server = spawn(process.execPath, [next, "start", "-p", String(port)], {
    cwd: ROOT,
    env: { ...env, BETTER_AUTH_URL: base },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const serverLog = [];
  for (const stream of [server.stdout, server.stderr]) {
    stream.on("data", (chunk) => serverLog.push(chunk.toString()));
  }
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      // not up yet
    }
    if (server.exitCode !== null || Date.now() > deadline) {
      throw new Error(`next start didn't come up:\n${serverLog.join("")}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  log(`next start on ${base}`);

  client = new pg.Client({ connectionString: dbUrl.toString() });
  await client.connect();
  const sessions = {
    editor: await mintSession(client, secret, { role: "editor", name: "Edie Editor", email: "editor@e2e.test" }),
    writer: await mintSession(client, secret, { role: "writer", name: "Wren Writer", email: "writer@e2e.test" }),
    contributor: await mintSession(client, secret, {
      role: "contributor",
      name: "Cory Contributor",
      email: "contributor@e2e.test",
    }),
  };

  browser = await chromium.launch({ channel: "chrome", headless: !headed });
  if (screenshots) fs.mkdirSync(screenshots, { recursive: true });
  const ctx = {
    base,
    browser,
    pg: client,
    sessions,
    state: {},
    screenshots,
    contextFor: (session, options) => contextFor(browser, base, session, options),
    fixture: (name) => path.join(ROOT, "e2e", "fixtures", name),
  };

  const flowDir = path.join(ROOT, "e2e", "flows");
  const files = fs
    .readdirSync(flowDir)
    .filter((f) => f.endsWith(".mjs") && (!only || f.includes(only)))
    .sort();
  for (const file of files) {
    const { flows } = await import(pathToFileURL(path.join(flowDir, file)).href);
    for (const flow of flows) {
      const label = `${file.replace(/\.mjs$/, "")} › ${flow.name}`;
      const started = Date.now();
      try {
        await flow.run(ctx);
        results.push({ label, ok: true, ms: Date.now() - started });
        log(`✓ ${label} (${Date.now() - started} ms)`);
      } catch (err) {
        results.push({ label, ok: false, ms: Date.now() - started, error: err });
        log(`✗ ${label}\n    ${String(err?.stack ?? err).split("\n").slice(0, 6).join("\n    ")}`);
      }
    }
  }
  const failed = results.filter((r) => !r.ok);
  log(`${results.length - failed.length} passed, ${failed.length} failed`);
  exitCode = failed.length || results.length === 0 ? 1 : 0;
} catch (err) {
  console.error("[e2e] setup failed:", err);
} finally {
  await cleanup();
}
process.exit(exitCode);
