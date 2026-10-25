import { parseDate } from "@/lib/dates";
import { getWritingPosts } from "@/lib/markdown";
import { absoluteUrl } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const dynamic = "force-static";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Feed readers resolve nothing against the site, so root-relative links and
// image sources in post HTML must be absolute.
function absolutize(html: string): string {
  return html.replace(/(\s(?:src|href)=")\/(?!\/)/g, `$1${SITE.url}/`);
}

function rssDate(raw: string | undefined): string {
  return parseDate(raw)?.toUTCString() ?? "";
}

export async function GET() {
  const posts = await getWritingPosts();
  const feedUrl = `${SITE.url}/feed.xml`;
  const lastBuild = rssDate(posts.map((p) => p.updated || p.date).find(Boolean));

  const items = posts
    .map((post) => {
      const url = absoluteUrl(`/writing/${post.slug}`);
      const pubDate = rssDate(post.date);
      return [
        "    <item>",
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        `      <dc:creator>${escapeXml(SITE.name)}</dc:creator>`,
        pubDate && `      <pubDate>${pubDate}</pubDate>`,
        ...[post.category, ...post.tags]
          .filter(Boolean)
          .map((term) => `      <category>${escapeXml(term as string)}</category>`),
        `      <description>${escapeXml(post.description)}</description>`,
        `      <content:encoded>${escapeXml(absolutize(post.content))}</content:encoded>`,
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(`${SITE.name} — Writing`)}</title>
    <link>${absoluteUrl("/writing")}</link>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
    <description>${escapeXml(SITE.description)}</description>
    <language>${SITE.language}</language>
    <managingEditor>${SITE.email} (${escapeXml(SITE.name)})</managingEditor>
${lastBuild ? `    <lastBuildDate>${lastBuild}</lastBuildDate>\n` : ""}    <image>
      <url>${SITE.url}/png-logo/do-monogram-192.png</url>
      <title>${escapeXml(`${SITE.name} — Writing`)}</title>
      <link>${absoluteUrl("/writing")}</link>
    </image>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
