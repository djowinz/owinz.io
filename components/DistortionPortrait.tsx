"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useTheme } from "next-themes";

interface DistortionPortraitProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}

export function DistortionPortrait({
  src,
  alt,
  width,
  height,
  className,
}: DistortionPortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const mousePos = useRef({ x: -1000, y: -1000 });
  const targetPos = useRef({ x: -1000, y: -1000 });
  const isHovering = useRef(false);
  const effectStrength = useRef(0);
  const targetStrength = useRef(0);

  const drawDistortion = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const img = imageRef.current;

    if (!canvas || !ctx || !img) return;

    // Smooth interpolation for position
    const posLerp = 0.15;
    mousePos.current.x += (targetPos.current.x - mousePos.current.x) * posLerp;
    mousePos.current.y += (targetPos.current.y - mousePos.current.y) * posLerp;

    // Smooth interpolation for effect strength (fade in/out)
    const strengthLerp = isHovering.current ? 0.08 : 0.12;
    effectStrength.current +=
      (targetStrength.current - effectStrength.current) * strengthLerp;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // If effect is nearly invisible, just draw the image normally
    if (effectStrength.current < 0.01) {
      ctx.filter = isDark ? "invert(1)" : "none";
      ctx.globalAlpha = 0.9;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.filter = "none";
      animationRef.current = requestAnimationFrame(drawDistortion);
      return;
    }

    const mx = mousePos.current.x;
    const my = mousePos.current.y;
    const radius = 80;
    const maxStrength = 24;
    const strength = maxStrength * effectStrength.current;

    // Create temporary canvas for the distortion
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext("2d");

    if (!tempCtx) {
      ctx.filter = isDark ? "invert(1)" : "none";
      ctx.globalAlpha = 0.9;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.filter = "none";
      animationRef.current = requestAnimationFrame(drawDistortion);
      return;
    }

    // Draw original image to temp canvas
    tempCtx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Get image data
    const imageData = tempCtx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const outputData = ctx.createImageData(canvas.width, canvas.height);
    const output = outputData.data;

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const dx = x - mx;
        const dy = y - my;
        const distance = Math.sqrt(dx * dx + dy * dy);

        let srcX = x;
        let srcY = y;

        if (distance < radius && distance > 0) {
          // Push outward effect - pixels are pushed away from the cursor
          const factor = 1 - distance / radius;
          const smoothFactor = factor * factor * (3 - 2 * factor); // Smooth hermite interpolation

          // Calculate push direction (away from cursor)
          const pushAmount = smoothFactor * strength;
          const dirX = dx / distance;
          const dirY = dy / distance;

          // Source pixel comes from closer to the center (creates outward push appearance)
          srcX = x - dirX * pushAmount;
          srcY = y - dirY * pushAmount;
        }

        // Clamp source coordinates
        srcX = Math.max(0, Math.min(canvas.width - 1, Math.round(srcX)));
        srcY = Math.max(0, Math.min(canvas.height - 1, Math.round(srcY)));

        const srcIndex = (srcY * canvas.width + srcX) * 4;
        const dstIndex = (y * canvas.width + x) * 4;

        // Invert colors for dark mode (white on dark), keep original for light mode
        if (isDark) {
          output[dstIndex] = 255 - data[srcIndex];
          output[dstIndex + 1] = 255 - data[srcIndex + 1];
          output[dstIndex + 2] = 255 - data[srcIndex + 2];
        } else {
          output[dstIndex] = data[srcIndex];
          output[dstIndex + 1] = data[srcIndex + 1];
          output[dstIndex + 2] = data[srcIndex + 2];
        }
        output[dstIndex + 3] = data[srcIndex + 3] * 0.9;
      }
    }

    ctx.putImageData(outputData, 0, 0);

    animationRef.current = requestAnimationFrame(drawDistortion);
  }, [isDark]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    img.onload = () => {
      imageRef.current = img;
      setIsLoaded(true);
    };
  }, [src]);

  useEffect(() => {
    if (isLoaded) {
      animationRef.current = requestAnimationFrame(drawDistortion);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isLoaded, drawDistortion]);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    // Set position immediately to cursor location on enter
    mousePos.current = { x: coords.x, y: coords.y };
    targetPos.current = { x: coords.x, y: coords.y };
    isHovering.current = true;
    // Fade in the effect strength
    targetStrength.current = 1;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    targetPos.current = { x: coords.x, y: coords.y };
  };

  const handleMouseLeave = () => {
    isHovering.current = false;
    // Fade out the effect strength
    targetStrength.current = 0;
  };

  return (
    <canvas
      ref={canvasRef}
      width={width * 2}
      height={height * 2}
      className={className}
      style={{ width, height }}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      aria-label={alt}
      role="img"
    />
  );
}
