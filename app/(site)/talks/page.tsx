import { format } from "date-fns";
import { getTalks, type Talk } from "@/lib/content";
import { parseDate } from "@/lib/dates";
import { SITE } from "@/lib/site";
import { JsonLd } from "@/components/JsonLd";
import { talkSchemas } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Talks",
  description:
    "Talks by Dyllen Owens on small software, visualisation, and the craft of shipping quietly — plus how to book a talk.",
  path: "/talks",
  image: "/talks/og.png",
});

const TOPICS = [
  "The craft of small software",
  "Honest data visualisation",
  "Designing for calm, not engagement",
  "Being a one-person design/eng team",
];

/** "2026-11-12" → "Nov 12, 2026", in a <time> machines can read. */
function TalkDate({ date }: { date: string }) {
  const day = parseDate(date);
  return day ? <time dateTime={date}>{format(day, "MMM d, yyyy")}</time> : <>{date}</>;
}

function TalkLinks({ links, className }: { links: Talk["links"]; className?: string }) {
  if (!links.length) return null;
  return (
    <div className={`flex flex-wrap gap-2.5 ${className ?? ""}`}>
      {links.map((link, i) => (
        <a
          key={`${i}-${link.url}`}
          href={link.url}
          rel="noopener"
          className="font-mono uppercase text-[10px] tracking-[1px] border border-edge px-2.5 py-1.5 cursor-none transition-colors hover:border-foreground"
        >
          {link.label} ↗
        </a>
      ))}
    </div>
  );
}

export default async function Talks() {
  const { upcoming, past } = await getTalks();

  return (
    <div className="max-w-[880px] mx-auto">
      {upcoming.length + past.length > 0 && (
        <JsonLd data={talkSchemas([...upcoming, ...past])} />
      )}
      {/* Masthead */}
      <div className="flex justify-between items-baseline font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-7">
        <span>Speaking</span>
        <span>
          {upcoming.length} upcoming · {past.length} past
        </span>
      </div>

      {/* Hero */}
      <h1 className="font-fraunces font-light text-[56px] sm:text-[72px] md:text-[96px] tracking-[-0.035em] leading-[0.95] mb-5">
        Talks
      </h1>
      <p className="font-fraunces-italic italic font-light text-lg sm:text-[22px] leading-snug text-muted mb-14 sm:mb-18 max-w-[640px]">
        I speak about small software, visualisation, and the craft of
        shipping things quietly.
      </p>

      {/* Upcoming */}
      <section className="mb-16 sm:mb-20">
        <div className="flex gap-3 items-center mb-7">
          <span className="w-2 h-2 rounded-full bg-accent ring-4 ring-accent/15" />
          <h2 className="font-fraunces-italic italic font-normal text-[28px] tracking-[-0.42px]">
            Upcoming
          </h2>
        </div>

        {upcoming.length > 0 ? (
          <div className="grid gap-4">
            {upcoming.map((talk) => (
              <article
                key={talk.slug}
                id={talk.slug}
                className="scroll-mt-8 grid grid-cols-[1fr_auto] gap-4 px-5 py-6 sm:px-8 sm:py-7 md:grid-cols-[200px_1fr_auto] md:gap-8 bg-(--sidebar) border border-edge items-start"
              >
                <div>
                  <div className="font-mono uppercase text-accent text-[11px] tracking-[0.9px] mb-2.5">
                    <TalkDate date={talk.date} />
                  </div>
                  {talk.format && (
                    <div className="font-mono uppercase text-muted text-[10px] tracking-[1.2px]">
                      {talk.format}
                    </div>
                  )}
                </div>
                <div className="order-last col-span-full md:order-none md:col-span-1">
                  <h3 className="font-fraunces text-2xl sm:text-[30px] tracking-[-0.6px] leading-tight mb-2.5">
                    {talk.title}
                  </h3>
                  {talk.venue && (
                    <div className="text-sm text-muted leading-normal">
                      {talk.venue}
                    </div>
                  )}
                  <TalkLinks links={talk.links} className="mt-4" />
                </div>
                {talk.status && (
                  <div className="font-mono uppercase text-muted text-[10px] tracking-[1.2px] border border-edge px-2.5 py-1 bg-background">
                    {talk.status}
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <article className="grid grid-cols-[1fr_auto] gap-4 px-5 py-6 sm:px-8 sm:py-7 md:grid-cols-[200px_1fr_auto] md:gap-8 bg-(--sidebar) border border-edge items-start">
            <div className="font-mono uppercase text-accent text-[11px] tracking-[0.9px]">
              2026 season
            </div>
            <div className="order-last col-span-full md:order-none md:col-span-1">
              <h3 className="font-fraunces text-2xl sm:text-[30px] tracking-[-0.6px] leading-tight mb-2.5">
                Currently scheduling
              </h3>
              <div className="text-sm text-muted leading-normal">
                The next round of talks is being planned. Have a stage in
                mind?{" "}
                <a
                  href={`mailto:${SITE.email}?subject=Speaking invitation`}
                  className="text-accent underline underline-offset-4 cursor-none"
                >
                  Invite me to speak
                </a>
                .
              </div>
            </div>
            <div className="font-mono uppercase text-muted text-[10px] tracking-[1.2px] border border-edge px-2.5 py-1 bg-background">
              Open
            </div>
          </article>
        )}
      </section>

      {/* Past (hidden while empty) */}
      {past.length > 0 && (
        <section className="mb-16 sm:mb-20">
          <h2 className="font-fraunces-italic italic font-normal text-[28px] tracking-[-0.42px] mb-2 pb-5 border-b border-foreground">
            Past
          </h2>
          {past.map((talk) => (
            <article
              key={talk.slug}
              id={talk.slug}
              className="scroll-mt-8 grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr_200px] sm:gap-6 py-6 border-b border-edge items-baseline"
            >
              <div className="font-mono text-muted text-[11px] tracking-[0.7px]">
                <TalkDate date={talk.date} />
              </div>
              <div>
                <h3 className="font-fraunces text-[22px] tracking-[-0.33px] leading-tight mb-1.5">
                  {talk.title}
                </h3>
                {talk.venue && (
                  <div className="text-[13px] text-muted">{talk.venue}</div>
                )}
              </div>
              <TalkLinks links={talk.links} className="sm:justify-end" />
            </article>
          ))}
        </section>
      )}

      {/* What I speak about + booking */}
      <section className="grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-12 pt-10 border-t border-edge">
        <div>
          <div className="font-mono font-medium uppercase text-accent text-[10px] tracking-[1.4px] mb-3.5">
            — What I speak about
          </div>
          <ul className="font-fraunces-italic italic font-light text-lg sm:text-xl leading-loose">
            {TOPICS.map((topic) => (
              <li key={topic}>— {topic}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="font-mono font-medium uppercase text-accent text-[10px] tracking-[1.4px] mb-3.5">
            — Booking
          </div>
          <p className="text-[15px] leading-relaxed text-muted mb-4">
            I prefer small conferences, meetups, and internal company events
            where there&apos;s room for conversation afterwards.
          </p>
          <a
            href={`mailto:${SITE.email}?subject=Speaking invitation`}
            className="font-mono uppercase text-[11px] tracking-[1.1px] border-b border-accent pb-1 cursor-none transition-colors hover:text-accent"
          >
            Invite me to speak →
          </a>
        </div>
      </section>
    </div>
  );
}
