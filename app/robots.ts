import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

// Everything is public, including to AI crawlers (GPTBot, ClaudeBot,
// PerplexityBot, Google-Extended, …) — being citable is the point of GEO.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
