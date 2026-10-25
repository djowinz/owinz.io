import {
  CONTENT_TYPE,
  getRecentContent,
  RecentPost,
  RecentProject,
} from "@/lib/markdown";
import { format } from "date-fns";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

type ContentTypeConfig = (typeof CONTENT_TYPE)[keyof typeof CONTENT_TYPE];
interface RecentContentProps {
  contentConfig: ContentTypeConfig;
  title: string;
  indexPath: string;
  indexLabel: string;
  limit?: number;
}

export default async function RecentProjects({
  contentConfig,
  title,
  indexPath,
  indexLabel,
  limit = 3,
}: RecentContentProps) {
  const recentContent = await getRecentContent(limit, contentConfig.type);
  const listDisplayContentRow = () => {
    if (contentConfig.type === CONTENT_TYPE.writing.type) {
      return (recentContent as RecentPost[]).map((post) => (
        <Link
          key={post.slug}
          href={`/writing/${post.slug}`}
          className="flex flex-col py-4.5 border-b border-edge last:border-none cursor-none transition-colors hover:bg-accent/5"
        >
          <div className="flex grow justify-between items-center mb-2">
            <span className="font-mono text-muted tracking-[1.4px] text-[10px] uppercase font-medium">
              {format(post.date, "MMM yyyy")}
            </span>
            <span className="font-mono text-muted tracking-[1.4px] text-[10px] uppercase font-medium">
              {post.readTimeDisplay}
            </span>
          </div>
          <h3 className="font-fraunces text-[19px] tracking-[-0.19px] leading-6">
            {post.title}
          </h3>
        </Link>
      ));
    }
    if (contentConfig.type === CONTENT_TYPE.projects.type) {
      return (recentContent as RecentProject[]).map((project, idx) => {
        return (
          <Link
            key={project.slug}
            href={`/projects/${project.slug}`}
            className="flex flex-row py-4.5 items-center border-b border-edge last:border-none cursor-none transition-colors hover:bg-accent/5"
          >
            <span className="font-mono text-muted tracking-[1.4px] text-[10px] uppercase font-medium pr-6 sm:pr-8">
              0{idx + 1}
            </span>
            <div className="flex flex-col min-w-0">
              <h3 className="font-fraunces text-[28px] tracking-[-0.19px] leading-7">
                {project.title}
              </h3>
              <span className="font-mono text-muted tracking-[1px] mt-1.5 text-[10px] uppercase font-medium">
                {project.category}
              </span>
            </div>
            <span className="font-mono text-muted tracking-[1.4px] text-[10px] uppercase font-medium ml-auto pl-4">
              {format(project.date, "yyyy")}
            </span>
          </Link>
        );
      });
    }
  };

  return (
    <section className="flex flex-col grow md:basis-0 min-w-0">
      <div className="flex justify-between items-center mb-5 pb-4 border-b border-edge">
        <h2 className="font-fraunces-italic italic font-medium text-foreground text-[22px]">
          {title}
        </h2>
        <Link
          href={indexPath}
          className="font-mono text-muted tracking-[1.4px] text-[10px] uppercase font-medium transition-colors hover:text-accent cursor-none"
        >
          {indexLabel}
          <ArrowRight className="inline w-2 h-2 ml-2" />
        </Link>
      </div>
      <div className="flex flex-col grow">
        {listDisplayContentRow()}
      </div>
    </section>
  );
}
