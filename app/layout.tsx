import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import Sidebar from "@/components/Sidebar";
import CursorWrangler from "@/components/CursorWrangler";

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
  title: "Owinz - Personal Journey",
  description: "A personal space to share my work, thoughts, and experiences",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${frauncesItalic.variable} h-full antialiased cursor-none`}
    >
      <body className="min-h-screen w-full">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <CursorWrangler />
          <div className="min-h-screen mx-auto grid max-w-7xl grid-cols-[minmax(0,256px)_1fr]">
            {/* Sidebar Column */}
            <aside className="relative bg-(--sidebar) p-8 before:absolute before:inset-y-0 before:right-full before:w-screen before:bg-(--sidebar) border-r border-(--edge)">
              <Sidebar />
            </aside>
            {/* Content Column */}
            <main className="relative bg-background px-18 py-20 after:absolute after:inset-y-0 after:left-full after:bg-background">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
