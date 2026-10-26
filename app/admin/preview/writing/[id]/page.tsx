import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArticleView } from "@/components/ArticleView";
import SiteChrome from "@/components/SiteChrome";
import { draftPost } from "@/lib/cms/preview";
import { requireCmsUser } from "@/lib/cms/session";
import { getWritingPosts } from "@/lib/content";
import { getDb } from "@/lib/db";

// A post's working draft, rendered exactly as the live article page would
// render it (same ArticleView, same chrome). Signed-in only: the session is
// checked here (proxy.ts only redirects early), which also makes the page
// render per request, so a draft is never cached. Photos come from the CMS
// photo route, which serves unpublished photos to signed-in users only.
export const metadata: Metadata = {
  title: "Draft preview",
  robots: { index: false, follow: false },
};
export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default function DraftPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <DraftPreview params={params} />
    </Suspense>
  );
}

async function DraftPreview({ params }: { params: Promise<{ id: string }> }) {
  await requireCmsUser();
  const { id } = await params;
  const post = UUID.test(id) ? await draftPost(getDb(), id) : null;
  if (!post) notFound();
  const readNext = (await getWritingPosts()).filter((p) => p.slug !== post.slug).slice(0, 2);

  return (
    <>
      <div
        role="status"
        className="flex items-center justify-between gap-4 border-b border-accent/40 bg-accent/10 px-5 py-2 font-mono font-medium uppercase text-[10px] tracking-[1.4px] text-foreground sm:px-8"
      >
        <span>
          Draft preview <span className="text-accent">·</span> not published
        </span>
        <Link href={`/admin/writing/${id}/`} className="text-muted transition-colors hover:text-accent">
          ← Editor
        </Link>
      </div>
      <SiteChrome>
        <ArticleView post={post} readNext={readNext} />
      </SiteChrome>
    </>
  );
}
