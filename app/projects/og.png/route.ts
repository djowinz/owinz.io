import { getProjects } from "@/lib/markdown";
import { renderOgCard } from "@/lib/og";

export const dynamic = "force-static";

export async function GET() {
  const projects = await getProjects();
  return renderOgCard({
    eyebrow: "Index",
    title: "Things I've built, carefully.",
    dek: "A small collection of projects. Each solves a problem I had.",
    meta: [`${projects.length} projects`],
  });
}
