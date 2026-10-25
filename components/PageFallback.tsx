// Suspense fallback for a dynamic public page's URL-specific content (see
// lib/static-params.ts). Prerendered pages never show it; it fills the column
// for the moment a client navigation waits on the page, so the footer doesn't
// jump up and back.
export function PageFallback() {
  return <div aria-busy="true" className="min-h-dvh" />;
}
