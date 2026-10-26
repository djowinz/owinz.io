import { getProjectPhoto } from "@/lib/content";
import { readBlob } from "@/lib/blob";

// Photos a project shows (in its case study or as its cover), uploaded
// through the CMS: stored in Blob, served from owinz.io/projects/<slug>/<photo>.
// Runs per request; the CDN caches the result per the Cache-Control below.
// (The social card has its own route, og.png/, which Next.js matches before
// this one.)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; file: string }> },
) {
  const { slug, file } = await params;
  const photo = await getProjectPhoto(slug, decodeURIComponent(file));
  const blob = photo && (await readBlob(photo.blobPathname));
  if (!photo || !blob) return new Response("Not found", { status: 404 });

  // Project HTML links photos with ?v=<version>, which changes whenever the
  // photo is replaced, so those URLs can be cached for good. Unversioned
  // links (llms-full.txt) revalidate daily.
  const versioned = new URL(request.url).searchParams.has("v");
  return new Response(blob.stream, {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": versioned
        ? "public, max-age=31536000, s-maxage=31536000, immutable"
        : "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
