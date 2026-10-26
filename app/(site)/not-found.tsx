import NotFoundContent, { notFoundMetadata } from "@/components/NotFoundContent";

export const metadata = notFoundMetadata;

// Rendered inside app/(site)/layout.tsx, which already provides the chrome.
export default function NotFound() {
  return <NotFoundContent />;
}
