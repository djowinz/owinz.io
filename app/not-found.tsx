import NotFoundContent, { notFoundMetadata } from "@/components/NotFoundContent";
import SiteChrome from "@/components/SiteChrome";

export const metadata = notFoundMetadata;

// URLs that match no route render outside app/(site), so this one brings the
// chrome; app/(site)/not-found.tsx handles notFound() inside the site layout.
export default function NotFound() {
  return (
    <SiteChrome>
      <NotFoundContent />
    </SiteChrome>
  );
}
