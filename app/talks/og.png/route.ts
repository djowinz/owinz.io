import { renderOgCard } from "@/lib/og";

export const dynamic = "force-static";

export function GET() {
  return renderOgCard({
    eyebrow: "Speaking",
    title: "Talks",
    dek: "Speaking about small software, visualisation, and the craft of shipping things quietly.",
  });
}
