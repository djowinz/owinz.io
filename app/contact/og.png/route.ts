import { renderOgCard } from "@/lib/og";
import { SITE } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  return renderOgCard({
    eyebrow: "Correspondence",
    title: "Say hello.",
    dek: `The best way to reach me is ${SITE.email}.`,
    meta: [SITE.timezone],
  });
}
