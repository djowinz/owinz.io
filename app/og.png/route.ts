import { renderOgCard } from "@/lib/og";
import { SITE } from "@/lib/site";

export function GET() {
  return renderOgCard({
    eyebrow: "Personal site",
    title: "Building intuitive, purposeful software",
    dek: "— and writing down what I learn along the way.",
    meta: [SITE.tagline.replace(/\.$/, "")],
  });
}
