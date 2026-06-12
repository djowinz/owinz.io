// Temporary diagnostic: load each route in headless Chrome and capture
// console output so we can see React hydration mismatch diffs (dev mode).
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const ROUTES = [
  "/",
  "/writing/",
  "/writing/art-of-debugging/",
  "/projects/",
  "/projects/chronicle/",
  "/talks/",
  "/contact/",
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();

const messages = [];
page.on("console", (msg) => {
  messages.push({ type: msg.type(), text: msg.text() });
});
page.on("pageerror", (err) => {
  messages.push({ type: "pageerror", text: err.message });
});

for (const route of ROUTES) {
  messages.length = 0;
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  // Give React time to hydrate and report
  await page.waitForTimeout(1500);

  const interesting = messages.filter(
    (m) =>
      m.type === "error" ||
      m.type === "warning" ||
      m.type === "pageerror" ||
      /hydrat|did not match|hydration-debug/i.test(m.text),
  );

  console.log(`\n========== ${route} ==========`);
  if (interesting.length === 0) {
    console.log("(no errors/warnings)");
  }
  for (const m of interesting) {
    console.log(`[${m.type}] ${m.text}\n`);
  }
}

await browser.close();
