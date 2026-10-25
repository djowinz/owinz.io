import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import Sidebar from "@/components/Sidebar";
import MobileHeader from "@/components/MobileHeader";
import CursorWrangler from "@/components/CursorWrangler";
import { SITE } from "@/lib/site";
import { siteSchema } from "@/lib/schema";
import { JsonLd } from "@/components/JsonLd";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "WONK"],
  display: "swap",
});

const frauncesItalic = Fraunces({
  variable: "--font-fraunces-italic",
  subsets: ["latin"],
  axes: ["opsz", "WONK"],
  display: "swap",
  style: "italic",
});

// Site-wide defaults. Deliberately no canonical or og:url here: a page that
// forgets pageMetadata() should fail the post-build SEO audit, not silently
// canonicalize to the home page.
export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: SITE.title,
    template: "%s — owinz.io",
  },
  description: SITE.description,
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: SITE.locale,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: SITE.title }],
  },
  twitter: {
    card: "summary_large_image",
    site: SITE.twitter,
    creator: SITE.twitter,
    images: ["/og.png"],
  },
  applicationName: SITE.title,
  authors: [{ name: SITE.name, url: SITE.url }],
  creator: SITE.name,
  publisher: SITE.name,
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/png-logo/do-monogram-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: { url: "/png-logo/do-monogram-180.png", sizes: "180x180" },
  },
  formatDetection: { email: false, telephone: false, address: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f1ec" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1a17" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${frauncesItalic.variable} h-full antialiased pointer-fine:cursor-none`}
    >
      <body className="min-h-screen w-full">
        <JsonLd data={siteSchema()} />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <CursorWrangler />
          <div className="min-h-screen mx-auto max-w-7xl lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
            {/* Top bar + menu below lg */}
            <MobileHeader />
            {/* Sidebar Column (lg+) */}
            <aside className="relative hidden lg:block bg-(--sidebar) before:absolute before:inset-y-0 before:right-full before:w-screen before:bg-(--sidebar) border-r border-(--edge)">
              <Sidebar />
            </aside>
            {/* Content Column */}
            <main className="relative min-w-0 bg-background px-5 py-10 sm:px-8 sm:py-14 md:px-12 lg:px-18 lg:py-20 after:absolute after:inset-y-0 after:left-full after:bg-background">
              {children}
            </main>
          </div>
        </ThemeProvider>
        {/* Vercel Web Analytics + Speed Insights; their scripts are served by
            Vercel at /_vercel/*, so they only report on Vercel deployments. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
