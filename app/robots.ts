import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

// Everything public is open, including to AI crawlers (GPTBot, ClaudeBot,
// PerplexityBot, Google-Extended, …) — being citable is the point of GEO.
// Only the CMS and its sign-in endpoints are off limits.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin/", "/api/"] }],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
