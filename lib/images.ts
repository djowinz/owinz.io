// Build-time processing for photos that live next to an article
// (content/writing/<slug>/photo.jpg). Originals stay untouched in content/;
// what ships is auto-rotated, capped in width, re-compressed, and stripped of
// metadata (phone photos carry GPS coordinates in EXIF).
import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

/** Rendered width cap: about 2x the 680px article column, for retina screens. */
export const MAX_IMAGE_WIDTH = 1600;

export const IMAGE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

// Shipped byte-for-byte: re-encoding would drop GIF animation or rasterize SVG.
const PASSTHROUGH = new Set([".gif", ".svg"]);

export function isImageFile(name: string): boolean {
  return path.extname(name).toLowerCase() in IMAGE_TYPES;
}

export function imageContentType(name: string): string {
  return IMAGE_TYPES[path.extname(name).toLowerCase()] ?? "application/octet-stream";
}

/** Dimensions of the image as shipped, for width/height attributes (no layout shift). */
export async function shippedImageSize(
  file: string,
): Promise<{ width: number; height: number } | undefined> {
  try {
    const meta = await sharp(file).metadata();
    const { width, height } = meta.autoOrient ?? meta;
    if (!width || !height) return undefined;
    if (PASSTHROUGH.has(path.extname(file).toLowerCase()) || width <= MAX_IMAGE_WIDTH) {
      return { width, height };
    }
    return { width: MAX_IMAGE_WIDTH, height: Math.round((height * MAX_IMAGE_WIDTH) / width) };
  } catch {
    return undefined;
  }
}

/** The bytes that get published for an article photo. */
export async function processImage(file: string): Promise<Buffer> {
  const ext = path.extname(file).toLowerCase();
  if (PASSTHROUGH.has(ext)) return readFile(file);

  const image = sharp(file)
    .autoOrient()
    .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true });
  switch (ext) {
    case ".png":
      // Lossless: PNGs are usually screenshots, where artifacts show.
      return image.png({ compressionLevel: 9 }).toBuffer();
    case ".webp":
      return image.webp({ quality: 82 }).toBuffer();
    case ".avif":
      return image.avif({ quality: 60 }).toBuffer();
    default:
      return image.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  }
}
