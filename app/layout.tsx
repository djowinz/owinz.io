import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import Sidebar from "@/components/Sidebar";
import MobileHeader from "@/components/MobileHeader";
import CursorWrangler from "@/components/CursorWrangler";
import { SITE } from "@/lib/site";

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

export const metadata: Metadata = {
  title: {
    default: SITE.title,
    template: "%s — owinz.io",
  },
  description: SITE.description,
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
      </body>
    </html>
  );
}
