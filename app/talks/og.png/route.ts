import { renderOgCard } from "@/lib/og";

export function GET() {
  return renderOgCard({
    eyebrow: "Speaking",
    title: "Talks",
    dek: "Speaking about small software, visualisation, and the craft of shipping things quietly.",
  });
}
