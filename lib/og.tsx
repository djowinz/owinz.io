// Build-time Open Graph card rendering via next/og.
// Fonts are read from assets/fonts so builds don't depend on the network.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cacheLife } from "next/cache";
import { ImageResponse } from "next/og";
import { summarize } from "./seo";
import { SITE } from "./site";

export const OG_SIZE = { width: 1200, height: 630 };

// Light-theme palette from app/globals.css.
const INK = "#1a1a1a";
const PAPER = "#f8f7f4";
const MUTED = "#6b6b6b";
const EDGE = "#e0dfd8";
const ACCENT = "#7c3aed";

const fontDir = path.join(process.cwd(), "assets", "fonts");
const font = (file: string) => readFile(path.join(fontDir, file));

async function fonts() {
  const [light, italic, semibold, mono] = await Promise.all([
    font("Fraunces-Light.ttf"),
    font("Fraunces-LightItalic.ttf"),
    font("Fraunces-SemiBold.ttf"),
    font("GeistMono-Medium.ttf"),
  ]);
  return [
    { name: "Fraunces", data: light, weight: 300 as const, style: "normal" as const },
    { name: "Fraunces", data: italic, weight: 300 as const, style: "italic" as const },
    { name: "Fraunces", data: semibold, weight: 600 as const, style: "normal" as const },
    { name: "Geist Mono", data: mono, weight: 500 as const, style: "normal" as const },
  ];
}

function titleSize(title: string): number {
  if (title.length <= 24) return 104;
  if (title.length <= 48) return 84;
  if (title.length <= 80) return 66;
  return 54;
}

interface OgCard {
  /** Small caps label, e.g. "Writing · Engineering". */
  eyebrow: string;
  title: string;
  /** Italic line under the title. */
  dek?: string;
  /** Footer name; defaults to the site owner. */
  byline?: string;
  /** Footer meta, e.g. ["15 March 2026", "3 min read"]. */
  meta?: string[];
}

/**
 * A social card as a PNG response. The rendered bytes are cached by the
 * card's content, so each card renders once and again only when its text
 * changes (e.g. after a post is republished with a new title).
 */
export async function renderOgCard(card: OgCard): Promise<Response> {
  return new Response(await ogCardPng(card), { headers: { "Content-Type": "image/png" } });
}

async function ogCardPng(card: OgCard): Promise<Uint8Array<ArrayBuffer>> {
  "use cache";
  cacheLife("max");
  return new Uint8Array(await (await drawOgCard(card)).arrayBuffer());
}

async function drawOgCard({ eyebrow, title, dek, byline = SITE.name, meta = [] }: OgCard) {
  const mono = {
    fontFamily: "Geist Mono",
    fontSize: 20,
    letterSpacing: 2.8,
    textTransform: "uppercase" as const,
    color: MUTED,
  };
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: PAPER,
          padding: "64px 80px",
          fontFamily: "Fraunces",
          color: INK,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", ...mono }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 12, height: 12, borderRadius: 12, background: ACCENT }} />
            owinz.io
          </div>
          <div style={{ display: "flex" }}>{eyebrow}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
          <div
            style={{
              fontSize: titleSize(title),
              fontWeight: 300,
              lineHeight: 1.02,
              letterSpacing: "-0.035em",
            }}
          >
            {title}
          </div>
          {dek && (
            <div
              style={{
                marginTop: 28,
                fontSize: 32,
                fontStyle: "italic",
                fontWeight: 300,
                lineHeight: 1.3,
                color: MUTED,
                maxWidth: 940,
              }}
            >
              {summarize(dek, 150)}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: `1px solid ${EDGE}`,
            paddingTop: 28,
          }}
        >
          <div style={{ display: "flex", fontSize: 34, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {byline}
          </div>
          <div style={{ display: "flex", gap: 28, ...mono }}>
            {meta.map((item) => (
              <div key={item} style={{ display: "flex" }}>
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await fonts() },
  );
}
