import { getProject, getProjects } from "@/lib/content";
import { renderOgCard } from "@/lib/og";
import { withPlaceholder } from "@/lib/static-params";

export async function generateStaticParams() {
  const projects = await getProjects();
  return withPlaceholder(projects.map((project) => ({ slug: project.slug })));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) return new Response("Not found", { status: 404 });
  return renderOgCard({
    eyebrow: ["Project", project.category].filter(Boolean).join(" · "),
    title: project.title,
    dek: project.description,
    meta: [project.year, project.platform].filter(Boolean) as string[],
  });
}
