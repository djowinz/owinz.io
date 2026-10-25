import type { Metadata } from "next";

// The CMS is private: never indexed, never in the sitemap.
export const metadata: Metadata = {
  title: { default: "CMS", template: "%s — CMS" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
