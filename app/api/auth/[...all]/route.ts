import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// The site uses trailing slashes (next.config.ts), so Next.js redirects
// /api/auth/sign-in/social to …/social/. Better Auth's routes have no
// trailing slash, so strip it before handing the request over.
const handlers = toNextJsHandler((request: Request) => {
  const url = new URL(request.url);
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
    return auth.handler(new Request(url, request));
  }
  return auth.handler(request);
});

export const { GET, POST } = handlers;
