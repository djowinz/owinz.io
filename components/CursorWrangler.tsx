"use client";
import { useState, useEffect } from "react";

export default function CursorWrangler() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      setMousePosition({ x: event.clientX, y: event.clientY });
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <div
      className="w-4 h-4 fixed rounded-full ring-accent ring-2 bg-transparent"
      style={{
        top: `${mousePosition.y - 6}px`,
        left: `${mousePosition.x - 6}px`,
        pointerEvents: "none",
        zIndex: 9999,
      }}
    />
  );
}
