import { getTalks } from "@/lib/markdown";
import { SITE } from "@/lib/site";

export const metadata = {
  title: "Talks",
  description:
    "Speaking about small software and the craft of shipping quietly.",
};

const TOPICS = [
  "The craft of small software",
  "Honest data visualisation",
  "Designing for calm, not engagement",
  "Being a one-person design/eng team",
];

export default async function Talks() {
  const { upcoming, past } = await getTalks();

  return (
    <div className="max-w-[880px] mx-auto">
      {/* Masthead */}
      <div className="flex justify-between items-baseline font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-7">
        <span>Speaking</span>
        <span>
          {upcoming.length} upcoming · {past.length} past
        </span>
      </div>

      {/* Hero */}
      <h1 className="font-fraunces font-light text-[96px] tracking-[-3.36px] leading-[0.95] mb-5">
        Talks
      </h1>
      <p className="font-fraunces-italic italic font-light text-[22px] leading-snug text-muted mb-18 max-w-[640px]">
        I speak about small software, visualisation, and the craft of
        shipping things quietly.
      </p>

      {/* Upcoming */}
      <section className="mb-20">
        <div className="flex gap-3 items-center mb-7">
          <span className="w-2 h-2 rounded-full bg-accent shadow-[0px_0px_0px_4px_rgba(124,58,237,0.15)]" />
          <h2 className="font-fraunces-italic italic font-normal text-[28px] tracking-[-0.42px]">
            Upcoming
          </h2>
        </div>

        {upcoming.length > 0 ? (
          <div className="grid gap-4">
            {upcoming.map((talk) => (
              <article
                key={talk.slug}
                className="grid grid-cols-[200px_1fr_auto] gap-8 px-8 py-7 bg-(--sidebar) border border-edge items-start"
              >
                <div>
                  <div className="font-mono uppercase text-accent text-[11px] tracking-[0.9px] mb-2.5">
                    {talk.date}
                  </div>
                  {talk.format && (
                    <div className="font-mono uppercase text-muted text-[10px] tracking-[1.2px]">
                      {talk.format}
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="font-fraunces text-[30px] tracking-[-0.6px] leading-tight mb-2.5">
                    {talk.title}
                  </h3>
                  {talk.venue && (
                    <div className="text-sm text-muted leading-normal">
                      {talk.venue}
                    </div>
                  )}
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
          <article className="grid grid-cols-[200px_1fr_auto] gap-8 px-8 py-7 bg-(--sidebar) border border-edge items-start">
            <div className="font-mono uppercase text-accent text-[11px] tracking-[0.9px]">
              2026 season
            </div>
            <div>
              <h3 className="font-fraunces text-[30px] tracking-[-0.6px] leading-tight mb-2.5">
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
        <section className="mb-20">
          <h2 className="font-fraunces-italic italic font-normal text-[28px] tracking-[-0.42px] mb-2 pb-5 border-b border-foreground">
            Past
          </h2>
          {past.map((talk) => (
            <article
              key={talk.slug}
              className="grid grid-cols-[120px_1fr_200px] gap-6 py-6 border-b border-edge items-baseline"
            >
              <div className="font-mono text-muted text-[11px] tracking-[0.7px]">
                {talk.date}
              </div>
              <div>
                <h3 className="font-fraunces text-[22px] tracking-[-0.33px] leading-tight mb-1.5">
                  {talk.title}
                </h3>
                {talk.venue && (
                  <div className="text-[13px] text-muted">{talk.venue}</div>
                )}
              </div>
              <div className="flex gap-2.5 justify-end">
                {talk.links.map((link) => (
                  <a
                    key={link.label}
                    href={link.url}
                    className="font-mono uppercase text-[10px] tracking-[1px] border border-edge px-2.5 py-1.5 cursor-none transition-colors hover:border-foreground"
                  >
                    {link.label} ↗
                  </a>
                ))}
              </div>
            </article>
          ))}
        </section>
      )}

      {/* What I speak about + booking */}
      <section className="grid grid-cols-2 gap-12 pt-10 border-t border-edge">
        <div>
          <div className="font-mono font-medium uppercase text-accent text-[10px] tracking-[1.4px] mb-3.5">
            — What I speak about
          </div>
          <ul className="font-fraunces-italic italic font-light text-xl leading-loose">
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
