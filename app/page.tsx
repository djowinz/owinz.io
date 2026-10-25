import { ChevronsRight } from "lucide-react";
import { getSeason } from "@/lib/dates";
import { format } from "date-fns";
import Link from "next/link";
import RecentContent from "@/components/RecentContent";
import { CONTENT_TYPE } from "@/lib/markdown";
import { JsonLd } from "@/components/JsonLd";
import { profilePageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata = pageMetadata({ description: SITE.description, path: "/", type: "profile" });

export default function Home() {
  return (
    <>
      <JsonLd data={profilePageSchema()} />
      {/* Masthead */}
      <div className="flex flex-wrap justify-between gap-x-6 gap-y-2 font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-12 sm:mb-[72px]">
        <span className="hidden sm:inline">owinz.io</span>
        <span>
          VOL. IV {getSeason()} &apos;{format(new Date(), "yy")}
        </span>
      </div>

      {/* Hero */}
      <div className="mb-16 sm:mb-24">
        <h1 className="text-[44px] sm:text-[64px] md:text-[80px] xl:text-[108px] font-light text-foreground font-fraunces tracking-[-0.04em] leading-[1.04] mb-6 sm:mb-8">
          Building{" "}
          <em className="font-normal text-accent font-fraunces-italic">
            intuitive, purposeful software
          </em>{" "}
          — and writing down what I learn along the way.
        </h1>
        <p className="font-sans leading-7 mb-10 sm:mb-14 text-muted font-medium max-w-2xl">
          I&apos;m Dyllen, a software engineer, leader, and writer. I love to
          build software that delights users in spaces that resonate with my
          creative passions. I&apos;m currently working on shipping v1.6 of Omni
          to enhance how gamers handle overlays.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/projects"
            className="flex align-middle items-center py-3 px-5 bg-foreground text-background text-sm leading-3 transition-all ring-0 hover:ring-4 ring-accent ring-inset cursor-none"
          >
            See the work
            <ChevronsRight className="w-4 ml-2" />
          </Link>
          <Link
            href="/writing"
            className="flex align-middle items-center py-3 px-5 bg-background text-sm leading-3 border border-edge transition-all hover:border-foreground cursor-none"
          >
            Read the writing
            <ChevronsRight className="w-4 ml-2" />
          </Link>
        </div>
      </div>

      {/* Content Sections */}
      <div className="flex flex-col gap-14 md:flex-row md:gap-16">
        <RecentContent
          contentConfig={CONTENT_TYPE.projects}
          title="Selected work"
          indexPath="/projects"
          indexLabel="Index"
        />
        <RecentContent
          contentConfig={CONTENT_TYPE.writing}
          title="Recently"
          indexPath="/writing"
          indexLabel="Archive"
        />
      </div>
    </>
  );
}
