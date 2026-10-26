// Unknown URLs under dynamic routes are real 404s on the very first request
// (lib/static-params.ts), and stay 404; known ones are 200. Add new dynamic
// routes to ROUTES.
import { assert, get, unique } from "../lib.mjs";

const ROUTES = ["/writing/{}/", "/writing/category/{}/", "/writing/tag/{}/"];
const KNOWN = ["/writing/art-of-debugging/", "/writing/category/engineering/", "/writing/", "/"];

export const flows = [
  {
    name: "unknown URLs return 404 on the first request and after",
    async run({ base }) {
      for (const route of ROUTES) {
        const path = route.replace("{}", `no-such-page-${unique()}`);
        const first = await get(base, path);
        assert(first.status === 404, `${path}: first request is 404 (got ${first.status})`);
        assert(/<meta name="robots" content="noindex"/.test(first.text), `${path}: noindex`);
        const again = await get(base, path);
        assert(again.status === 404, `${path}: repeat request is 404 (got ${again.status})`);
      }
    },
  },
  {
    name: "known pages are 200 with their content in the HTML",
    async run({ base }) {
      for (const path of KNOWN) {
        const res = await get(base, path);
        assert(res.status === 200, `${path}: 200 (got ${res.status})`);
        assert(/<h1[\s>]/.test(res.text), `${path}: server-rendered <h1>`);
      }
    },
  },
];
