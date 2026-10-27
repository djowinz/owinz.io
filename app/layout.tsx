import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SITE } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Falls back to a system monospace font, not the default metric-scaled
// Arial: scaled Arial matches lowercase widths only, and its wide capitals
// wrapped the uppercase mono labels until Geist Mono loaded (a layout
// shift). Monospace faces all advance ~0.6em like Geist Mono, and the
// "Geist Mono System" face (app/globals.css) gives them Geist Mono's ascent
// and descent, so line height doesn't change either.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  adjustFontFallback: false,
  fallback: ["Geist Mono System", "Menlo", "Consolas", "DejaVu Sans Mono", "Courier New", "monospace"],
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
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${frauncesItalic.variable} h-full antialiased`}
    >
      <body className="min-h-screen w-full">
        {/* Runs before the first paint: marks JavaScript as on, so CSS can
            swap a chart's fallback table for its reserved space (globals.css). */}
        <script dangerouslySetInnerHTML={{ __html: 'document.documentElement.classList.add("js")' }} />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        {/* Vercel Web Analytics + Speed Insights; their scripts are served by
            Vercel at /_vercel/*, so they only report on Vercel deployments. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
