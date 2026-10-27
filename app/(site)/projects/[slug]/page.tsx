import { getProject, getProjects } from "@/lib/content";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import ArticleHtml from "@/components/ArticleHtml";
import { breadcrumbSchema, projectSchema } from "@/lib/schema";
import { isoDate, pageMetadata } from "@/lib/seo";
import { withPlaceholder } from "@/lib/static-params";
import { notFoundMetadata } from "@/components/NotFoundContent";

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
}

// Prerendered per slug: an unknown slug is rendered (and cached) as a real
// 404 before any HTML is sent, rather than streaming a fallback shell with a
// 200. Every read goes through a `use cache` getter; navigation stays fast
// because each slug's page is static.
export const ensureStatic = "navigation";
export const instant = false;

export async function generateStaticParams() {
  const projects = await getProjects();
  return withPlaceholder(projects.map((project) => ({ slug: project.slug })));
}

export async function generateMetadata({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) return notFoundMetadata;
  return pageMetadata({
    title: project.title,
    description: project.description,
    path: `/projects/${project.slug}`,
    image: `/projects/${project.slug}/og.png`,
    type: "article",
    publishedTime: isoDate(project.launchDate),
    modifiedTime: isoDate(project.updated),
    section: project.category,
    tags: project.technologies,
  });
}

const linkClass = "cursor-none transition-colors hover:text-accent";

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const projects = await getProjects();
  const index = projects.findIndex((p) => p.slug === slug);
  if (index === -1) notFound();
  const project = projects[index];
  const num = String(index + 1).padStart(2, "0");
  const next = projects[(index + 1) % projects.length];
  const nextNum = String(((index + 1) % projects.length) + 1).padStart(2, "0");

  const facts = [
    ["Role", project.role],
    ["Year", project.year],
    ["Status", project.status],
    ["Platform", project.platform],
  ].filter(([, value]) => Boolean(value)) as [string, string][];

  const metaParts = [
    { key: "num", node: `№ ${num}` },
    project.year && { key: "year", node: project.year },
    project.categoryRef && {
      key: "category",
      node: (
        <Link href={`/projects/category/${project.categoryRef.slug}`} className={linkClass}>
          {project.categoryRef.name}
        </Link>
      ),
    },
  ].filter(Boolean) as { key: string; node: React.ReactNode }[];

  return (
    <article className="max-w-[720px] mx-auto">
      <JsonLd
        data={[
          projectSchema(project),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Projects", path: "/projects" },
            { name: project.title, path: `/projects/${project.slug}` },
          ]),
        ]}
      />
      {/* Back link */}
      <Link
        href="/projects"
        className="inline-flex gap-2 items-center font-mono uppercase text-muted text-[11px] tracking-[1.3px] mb-10 sm:mb-14 cursor-none transition-colors hover:text-accent"
      >
        <span>←</span>
        <span>Back to projects</span>
      </Link>

      {/* Meta row */}
      <div className="flex flex-wrap gap-x-4 sm:gap-x-6 gap-y-2 font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-7">
        {metaParts.map((part, i) => (
          <span key={part.key} className="flex gap-4 sm:gap-6">
            {i > 0 && <span>/</span>}
            <span>{part.node}</span>
          </span>
        ))}
      </div>

      {/* Title + dek */}
      <h1 className="font-fraunces font-light text-[52px] sm:text-[68px] md:text-[88px] tracking-[-0.035em] leading-[0.95] mb-6 break-words">
        {project.title}
      </h1>
      {project.description && (
        <p className="font-fraunces-italic italic font-light text-xl sm:text-2xl tracking-[-0.24px] leading-snug text-muted mb-10 sm:mb-14 max-w-[580px]">
          {project.description}
        </p>
      )}

      {/* Figure panel */}
      <div className="relative aspect-[16/10] border border-edge mb-10 sm:mb-12 overflow-hidden bg-gradient-to-br from-(--secondary) to-(--sidebar)">
        {project.image ? (
          <Image
            src={project.image}
            alt={`${project.title} screenshot`}
            fill
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-6 sm:inset-10 flex items-center justify-center font-fraunces font-light text-[28px] sm:text-[40px] tracking-[-0.8px] text-muted/40">
            {project.title}
          </div>
        )}
        <div className="absolute top-3 right-4 sm:top-4 sm:right-5 font-mono text-muted text-[10px] tracking-[1px]">
          FIG. 01 — OVERVIEW
        </div>
      </div>

      {/* Buttons */}
      {(project.liveUrl || project.sourceUrl) && (
        <div className="flex flex-wrap gap-3 mb-12 sm:mb-16">
          {project.liveUrl && (
            <a
              href={project.liveUrl}
              className="inline-flex items-center gap-2.5 py-3 px-4.5 bg-foreground text-background text-[13px] cursor-none transition-all ring-0 hover:ring-4 ring-accent ring-inset"
            >
              View live <span className="opacity-60">↗</span>
            </a>
          )}
          {project.sourceUrl && (
            <a
              href={project.sourceUrl}
              className="inline-flex items-center gap-2.5 py-3 px-4.5 border border-edge text-[13px] cursor-none transition-colors hover:border-foreground"
            >
              Source <span className="opacity-60">↗</span>
            </a>
          )}
        </div>
      )}

      {/* Factsheet */}
      {(facts.length > 0 || project.technologyRefs.length > 0) && (
        <div className="grid grid-cols-2 gap-x-6 sm:gap-x-12 gap-y-8 border-y border-edge py-8 mb-12 sm:mb-16">
          {facts.map(([key, value]) => (
            <div key={key}>
              <div className="font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-2">
                {key}
              </div>
              <div className="text-[15px]">{value}</div>
            </div>
          ))}
          {project.technologyRefs.length > 0 && (
            <div className="col-span-full">
              <div className="font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-2.5">
                Stack
              </div>
              <div className="flex flex-wrap gap-x-4.5 gap-y-1.5">
                {project.technologyRefs.map((tech) => (
                  <Link
                    key={tech.slug}
                    href={`/projects/technology/${tech.slug}`}
                    className={`font-mono text-[11px] tracking-[0.4px] ${linkClass}`}
                  >
                    {tech.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Body — § counters via .prose-sections */}
      <ArticleHtml className="prose prose-sections" html={project.content} />

      {/* Next project footer */}
      {next.slug !== project.slug && (
        <aside className="mt-16 border-t border-edge pt-8 flex flex-col gap-6 sm:flex-row sm:justify-between sm:items-end">
          <div>
            <div className="font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-2.5">
              Next project →
            </div>
            <Link
              href={`/projects/${next.slug}`}
              className="font-fraunces text-[32px] sm:text-[40px] tracking-[-0.8px] cursor-none transition-colors hover:text-accent"
            >
              {next.title}{" "}
              <span className="font-mono text-xs text-muted align-super ml-1.5">
                № {nextNum}
              </span>
            </Link>
          </div>
          <Link
            href="/projects"
            className="self-start sm:self-auto font-mono uppercase text-muted text-[11px] tracking-[1.1px] border-b border-edge pb-1 cursor-none transition-colors hover:text-accent"
          >
            All projects
          </Link>
        </aside>
      )}
    </article>
  );
}
