// Browser side of photo uploads. Big phone photos are shrunk to 2400px
// before upload: it keeps requests under Vercel's 4.5 MB limit, and drawing
// to a canvas applies the photo's rotation and drops its metadata (location
// included). The server then does the real processing (lib/images.ts).
export interface EditorPhoto {
  id: string;
  name: string;
  width: number | null;
  height: number | null;
  /** Changes when the photo is replaced; busts the preview's cache. */
  version: string;
}

const MAX_EDGE = 2400;
const SHRINKABLE = /^image\/(jpeg|png|webp)$/;

async function shrink(file: File): Promise<{ blob: Blob; name: string }> {
  if (!SHRINKABLE.test(file.type)) return { blob: file, name: file.name };
  const bitmap = await createImageBitmap(file); // honours EXIF orientation
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 3.5 * 1024 * 1024 && file.type !== "image/webp") {
    bitmap.close();
    return { blob: file, name: file.name };
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // PNGs (usually screenshots) stay lossless; photos become JPEG.
  const png = file.type === "image/png";
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that image."))), png ? "image/png" : "image/jpeg", 0.9),
  );
  const base = file.name.replace(/\.[^.]+$/, "") || "photo";
  return { blob, name: `${base}.${png ? "png" : "jpg"}` };
}

export async function uploadPhoto(postId: string, file: File): Promise<EditorPhoto> {
  const { blob, name } = await shrink(file);
  const form = new FormData();
  form.set("postId", postId);
  form.set("name", name);
  form.set("file", blob, name);
  const res = await fetch("/api/cms/photos/", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status}).`);
  return { id: data.id, name: data.name, width: data.width, height: data.height, version: Date.now().toString(36) };
}

export function photoSrc(photo: EditorPhoto): string {
  return `/api/cms/photos/${photo.id}/?v=${photo.version}`;
}
