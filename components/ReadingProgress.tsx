"use client";

import { useEffect, useRef } from "react";

// A thin accent bar across the top of the page that fills as you read the
// article body (.prose), Medium-style. Browsers with CSS scroll-driven
// animations run it entirely in CSS (app/globals.css, "Reading progress");
// this effect only does the work in browsers without them.
export function ReadingProgress() {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof CSS !== "undefined" && CSS.supports("animation-timeline: view()")) return;
    const body = document.querySelector<HTMLElement>("[data-reading] .prose");
    const el = bar.current;
    if (!body || !el) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const { top, height } = body.getBoundingClientRect();
      // 0 when the body's top reaches the top of the viewport, 1 when its
      // bottom reaches the bottom: the same range as the CSS version.
      const distance = height - window.innerHeight;
      const progress = distance > 0 ? Math.min(1, Math.max(0, -top / distance)) : top <= 0 ? 1 : 0;
      el.style.transform = `scaleX(${progress})`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return <div ref={bar} aria-hidden className="reading-progress" />;
}
