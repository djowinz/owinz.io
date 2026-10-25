import { JsonLd } from "@/components/JsonLd";
import WritingIndex from "@/components/WritingIndex";
import { getWritingPosts, getWritingTaxonomy } from "@/lib/content";
import { blogSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Writing",
  description:
    "Essays by Dyllen Owens on software engineering, design, and the slow craft of making software that doesn't shout.",
  path: "/writing",
  image: "/writing/og.png",
});

export default async function Writing() {
  const [posts, { categories, tags }] = await Promise.all([getWritingPosts(), getWritingTaxonomy()]);
  return (
    <>
      <JsonLd data={blogSchema(posts)} />
      <WritingIndex
        eyebrow="Archive"
        title="Writing"
        intro={<>Notes on design, engineering, and the slow craft of making software that doesn&apos;t shout.</>}
        posts={posts}
        categories={categories}
        tags={tags}
        active={null}
      />
    </>
  );
}
