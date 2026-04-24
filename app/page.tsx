import { getSeason } from "@/lib/dates";
import { format } from "date-fns";

export default function Home() {
  return (
    <>
      {/* Masthead */}
      <div className="flex justify-between font-mono font-medium uppercase text-muted text-[10px] tracking-[1.4px] mb-[72px]">
        <span>owinz.io</span>
        <span>
          VOL. IV {getSeason()} &apos;{format(new Date(), "yy")}
        </span>
        <span className="flex justify-between items-center">
          <span className="w-1.75 h-1.75 mr-2 rounded-full bg-accent shadow-[0px_0px_0px_3px_rgba(124,58,237,0.15)]"></span>
          Available for new work
        </span>
      </div>

      {/* Hero */}
      <div>
        <h1 className="text-[108px] font-light text-foreground font-fraunces tracking-[-4.32px] leading-28 mb-8">
          Building{" "}
          <em className="font-normal text-accent font-fraunces-italic">
            small, purposeful software
          </em>{" "}
          — and writing down what I learn along the way.
        </h1>
        <p className="font-sans leading-7 mb-14 text-muted font-medium max-w-2xl">
          I&apos;m Dyllen, a software engineer, leader, and writer. I love to
          build software that delights users exploring spaces that resonate with
          my creative voice. I&apos;m currently working on shipping v1.6 of Omni
          to enhance how gamers handle overlays.
        </p>
      </div>
    </>
  );
}
