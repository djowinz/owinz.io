// llms.txt (https://llmstxt.org): a markdown map of the site for language
// models, plus llms-full.txt with every article and case study inline.
import { format } from "date-fns";
import { parseDate } from "./dates";
import { getProjects, getTalks, getWritingPosts } from "./content";
import { absoluteUrl } from "./seo";
import { SITE } from "./site";

function displayDate(raw: string | undefined): string | undefined {
  const date = parseDate(raw);
  return date && format(date, "MMMM d, yyyy");
}

function preamble(): string {
  return [
    `# ${SITE.name}`,
    "",
    `> ${SITE.description}`,
    "",
    `${SITE.name} (${SITE.tagline.replace(/\.$/, "").toLowerCase()}) publishes essays, project case studies, and talks at ${absoluteUrl("/")}.`,
    `Contact: ${SITE.email}. Profiles: ${SITE.socials.map((s) => `${s.label} ${s.url}`).join(", ")}.`,
  ].join("\n");
}

export async function buildLlmsTxt(): Promise<string> {
  const [posts, projects, { upcoming, past }] = await Promise.all([
    getWritingPosts(),
    getProjects(),
    getTalks(),
  ]);

  const sections = [preamble()];

  sections.push(
    [
      "## Writing",
      "",
      ...posts.map((post) => {
        const meta = [displayDate(post.date), post.category].filter(Boolean).join(", ");
        return `- [${post.title}](${absoluteUrl(`/writing/${post.slug}`)}): ${post.description}${meta ? ` (${meta})` : ""}`;
      }),
    ].join("\n"),
  );

  sections.push(
    [
      "## Projects",
      "",
      ...projects.map((project) => {
        const stack = project.technologies.length ? ` Built with ${project.technologies.join(", ")}.` : "";
        return `- [${project.title}](${absoluteUrl(`/projects/${project.slug}`)}): ${project.description}${stack}`;
      }),
    ].join("\n"),
  );

  const talks = [...upcoming, ...past];
  sections.push(
    [
      "## Talks",
      "",
      talks.length
        ? talks
            .map((talk) => `- ${talk.title}${talk.venue ? `, ${talk.venue}` : ""}${talk.date ? ` (${displayDate(talk.date) ?? talk.date})` : ""}`)
            .join("\n")
        : `- Currently scheduling. Speaking invitations: ${SITE.email}`,
      `- [Talks page](${absoluteUrl("/talks")})`,
    ].join("\n"),
  );

  sections.push(
    [
      "## Optional",
      "",
      `- [Full text of all writing and projects](${SITE.url}/llms-full.txt)`,
      `- [RSS feed](${SITE.url}/feed.xml)`,
      `- [Contact](${absoluteUrl("/contact")})`,
    ].join("\n"),
  );

  return `${sections.join("\n\n")}\n`;
}

export async function buildLlmsFullTxt(): Promise<string> {
  const [posts, projects] = await Promise.all([getWritingPosts(), getProjects()]);

  const docs = [
    ...posts.map((post) =>
      [
        `# ${post.title}`,
        "",
        `URL: ${absoluteUrl(`/writing/${post.slug}`)}`,
        `Author: ${post.author}`,
        displayDate(post.date) && `Published: ${displayDate(post.date)}`,
        displayDate(post.updated) && `Updated: ${displayDate(post.updated)}`,
        post.category && `Category: ${post.category}`,
        post.tags.length > 0 && `Tags: ${post.tags.join(", ")}`,
        "",
        `> ${post.description}`,
        "",
        post.markdown,
      ]
        .filter((line) => typeof line === "string")
        .join("\n"),
    ),
    ...projects.map((project) =>
      [
        `# ${project.title} (project)`,
        "",
        `URL: ${absoluteUrl(`/projects/${project.slug}`)}`,
        `Author: ${SITE.name}`,
        project.year && `Year: ${project.year}`,
        project.role && `Role: ${project.role}`,
        project.status && `Status: ${project.status}`,
        project.technologies.length > 0 && `Stack: ${project.technologies.join(", ")}`,
        project.liveUrl && `Live: ${project.liveUrl}`,
        "",
        `> ${project.description}`,
        "",
        project.markdown,
      ]
        .filter((line) => typeof line === "string")
        .join("\n"),
    ),
  ];

  return `${preamble()}\n\n---\n\n${docs.join("\n\n---\n\n")}\n`;
}
