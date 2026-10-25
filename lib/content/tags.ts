// Cache tags for published content. Every cached read of a collection is
// tagged with it, so one refresh updates its pages, the home page, the
// sitemap, the RSS feed, and llms.txt together.
export const CONTENT_TAGS = {
  writing: "content:writing",
  projects: "content:projects",
  talks: "content:talks",
} as const;

export type ContentTag = keyof typeof CONTENT_TAGS;
