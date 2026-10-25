// Image formats the site accepts, by extension. Kept free of dependencies so
// browser code (the CMS editor) can use it; processing lives in lib/images.ts.
export const IMAGE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};
