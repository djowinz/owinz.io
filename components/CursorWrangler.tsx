"use client";
import { useState, useEffect } from "react";

export default function CursorWrangler() {
  // null until the first mousemove, so the ring never parks at (0, 0).
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      setMousePosition({ x: event.clientX, y: event.clientY });
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  if (!mousePosition) return null;

  return (
    // Touch screens have no cursor to replace.
    <div
      className="hidden pointer-fine:block w-4 h-4 fixed rounded-full ring-accent ring-2 bg-transparent"
      style={{
        top: `${mousePosition.y - 6}px`,
        left: `${mousePosition.x - 6}px`,
        pointerEvents: "none",
        zIndex: 9999,
      }}
    />
  );
}
