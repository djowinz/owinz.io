import { SITE } from "@/lib/site";
import Link from "next/link";

export const metadata = {
  title: "Contact",
  description: "How to reach Dyllen Owens.",
};

const CHANNELS: [string, string, string, string][] = [
  ["Email", SITE.email, `mailto:${SITE.email}`, "Best for anything substantive"],
  ["GitHub", "github.com/djowinz", SITE.socials[0].url, "Code, issues, small PRs"],
  ["LinkedIn", "in/dyllen-owens", SITE.socials[1].url, "The professional bits"],
  ["Twitter", "@djowinz", SITE.socials[2].url, "Short thoughts, replies welcome"],
];

const REPLIES = [
  "Notes on the writing",
  "Questions about the tools I make",
  "Freelance inquiries (selective)",
  "Speaking invitations",
  "Genuinely interesting cold emails",
];

const NO_REPLIES = [
  "Mass outreach templates",
  '"Quick call" requests with no context',
  "Crypto anything, sorry",
];

export default function Contact() {
  return (
    <div className="max-w-[820px] mx-auto">
      {/* Masthead */}
      <div className="flex justify-between items-baseline font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-7">
        <span>Correspondence</span>
        <span>{SITE.timezone}</span>
      </div>

      <h1 className="font-fraunces font-light text-[96px] tracking-[-3.36px] leading-[0.95] mb-16">
        Say <em className="font-fraunces-italic text-accent">hello</em>.
      </h1>

      {/* Letter */}
      <div className="font-fraunces font-light text-2xl tracking-[-0.12px] leading-normal mb-18 max-w-[720px]">
        <p className="mb-6">
          The best way to reach me is{" "}
          <a
            href={`mailto:${SITE.email}`}
            className="text-accent italic underline underline-offset-4 cursor-none"
          >
            {SITE.email}
          </a>
          . I read every message and try to reply within a few days, though
          I&apos;ve been known to take a week when the inbox gets unkind.
        </p>
        <p className="mb-6 text-muted">
          I&apos;m especially glad to hear from you if you&apos;re working on{" "}
          <em>small, considered</em> software — or if you&apos;ve read
          something I wrote and want to disagree with me. I like being
          disagreed with.
        </p>
        <p className="text-muted">
          For speaking invitations,{" "}
          <a
            href={`mailto:${SITE.email}?subject=Speaking invitation`}
            className="text-accent italic underline underline-offset-4 cursor-none"
          >
            email works too
          </a>
          . Write in your own words. I prefer it.
        </p>
      </div>

      {/* Channels + reply lists */}
      <div className="grid grid-cols-[1.1fr_1fr] gap-16 border-t border-edge pt-10">
        <section>
          <div className="font-mono font-medium uppercase text-accent text-[10px] tracking-[1.4px] mb-5">
            — Channels
          </div>
          {CHANNELS.map(([label, display, url, note]) => (
            <div
              key={label}
              className="grid grid-cols-[100px_1fr] gap-5 py-4.5 border-b border-edge items-baseline"
            >
              <div className="font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px]">
                {label}
              </div>
              <div>
                <a
                  href={url}
                  className="block font-fraunces text-xl tracking-[-0.2px] cursor-none transition-colors hover:text-accent"
                >
                  {display}
                </a>
                <div className="text-xs text-muted italic mt-1">{note}</div>
              </div>
            </div>
          ))}
        </section>

        <section>
          <div className="font-mono font-medium uppercase text-accent text-[10px] tracking-[1.4px] mb-5">
            — What I reply to
          </div>
          <ul className="font-fraunces-italic italic font-light text-lg leading-normal mb-7">
            {REPLIES.map((item) => (
              <li key={item} className="flex gap-3 py-2">
                <span className="text-accent not-italic">+</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-3.5">
            — Probably won&apos;t reply to
          </div>
          <ul className="text-sm leading-relaxed text-muted">
            {NO_REPLIES.map((item) => (
              <li key={item} className="flex gap-3 py-1">
                <span className="text-(--edge)">—</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Sign-off */}
      <div className="mt-20 pt-8 border-t border-edge flex justify-between items-baseline">
        <div>
          <div className="font-fraunces-italic italic font-light text-[28px] tracking-[-0.28px] mb-1">
            — Dyllen
          </div>
          <div className="font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px]">
            Written from the Mountain Time zone
          </div>
        </div>
        <Link
          href="/feed.xml"
          className="font-mono font-medium uppercase text-accent text-[10px] tracking-[1.4px] cursor-none"
        >
          RSS ↗
        </Link>
      </div>
    </div>
  );
}
