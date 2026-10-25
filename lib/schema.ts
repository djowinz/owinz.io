// schema.org JSON-LD builders. Entities reference the site-wide Person and
// WebSite (rendered once in the root layout) by @id, so each page only
// describes itself.
import type { ProjectPost, Talk, WritingPost } from "./markdown";
import { absoluteUrl, isoDate } from "./seo";
import { SITE } from "./site";

type Thing = Record<string, unknown>;

export const PERSON_ID = `${SITE.url}/#person`;
export const WEBSITE_ID = `${SITE.url}/#website`;
const person = { "@id": PERSON_ID };

export function siteSchema(): Thing {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        url: absoluteUrl("/"),
        name: SITE.name,
        alternateName: "owinz.io",
        description: SITE.description,
        inLanguage: SITE.language,
        publisher: person,
      },
      {
        "@type": "Person",
        "@id": PERSON_ID,
        name: SITE.name,
        url: absoluteUrl("/"),
        image: absoluteUrl("/self-portrait.svg"),
        jobTitle: SITE.jobTitle,
        description: SITE.tagline,
        email: `mailto:${SITE.email}`,
        sameAs: SITE.socials.map((s) => s.url),
      },
    ],
  };
}

export function profilePageSchema(): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: absoluteUrl("/"),
    mainEntity: person,
    isPartOf: { "@id": WEBSITE_ID },
  };
}

export function breadcrumbSchema(trail: { name: string; path: string }[]): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

export function blogPostingSchema(post: WritingPost, wordCount: number): Thing {
  const url = absoluteUrl(`/writing/${post.slug}`);
  const published = isoDate(post.date);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    url,
    mainEntityOfPage: url,
    headline: post.title,
    description: post.description,
    image: `${url}og.png`,
    datePublished: published,
    dateModified: isoDate(post.updated) ?? published,
    author: person,
    publisher: person,
    isPartOf: { "@id": WEBSITE_ID },
    inLanguage: SITE.language,
    articleSection: post.category,
    keywords: post.tags.length ? post.tags.join(", ") : undefined,
    wordCount,
  };
}

export function blogSchema(posts: WritingPost[]): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    url: absoluteUrl("/writing"),
    name: `${SITE.name} — Writing`,
    author: person,
    isPartOf: { "@id": WEBSITE_ID },
    blogPost: posts.map((post) => ({
      "@type": "BlogPosting",
      "@id": `${absoluteUrl(`/writing/${post.slug}`)}#article`,
      headline: post.title,
      url: absoluteUrl(`/writing/${post.slug}`),
      datePublished: isoDate(post.date),
    })),
  };
}

// Projects are described as CreativeWork rather than SoftwareApplication:
// the latter pulls Search Console into expecting offers/ratings.
export function projectSchema(project: ProjectPost): Thing {
  const url = absoluteUrl(`/projects/${project.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "@id": `${url}#project`,
    url,
    name: project.title,
    headline: project.title,
    description: project.description,
    image: `${url}og.png`,
    dateCreated: isoDate(project.launchDate),
    dateModified: isoDate(project.updated) ?? isoDate(project.launchDate),
    author: person,
    creator: person,
    genre: project.category,
    keywords: project.technologies.length ? project.technologies.join(", ") : undefined,
    sameAs: [project.liveUrl, project.sourceUrl].filter(Boolean),
    isPartOf: { "@id": WEBSITE_ID },
  };
}

export function projectListSchema(projects: ProjectPost[]): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    url: absoluteUrl("/projects"),
    name: `Projects — ${SITE.name}`,
    isPartOf: { "@id": WEBSITE_ID },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: projects.map((project, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: absoluteUrl(`/projects/${project.slug}`),
        name: project.title,
      })),
    },
  };
}

export function talkSchemas(talks: Talk[]): Thing[] {
  return talks
    .filter((talk) => isoDate(talk.date))
    .map((talk) => ({
      "@context": "https://schema.org",
      "@type": "Event",
      name: talk.title,
      startDate: isoDate(talk.date),
      eventStatus: "https://schema.org/EventScheduled",
      ...(talk.venue && {
        location: { "@type": "Place", name: talk.venue, address: talk.venue },
      }),
      performer: person,
      organizer: talk.venue ? { "@type": "Organization", name: talk.venue } : undefined,
      url: absoluteUrl("/talks"),
      sameAs: talk.links.map((link) => link.url),
    }));
}

export function contactPageSchema(): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    url: absoluteUrl("/contact"),
    mainEntity: person,
    isPartOf: { "@id": WEBSITE_ID },
  };
}
