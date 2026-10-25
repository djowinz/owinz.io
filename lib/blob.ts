// Photo storage. Files are processed before upload (see lib/images.ts) and
// read back through readBlob(), so the site serves them from owinz.io.
//
//   OWINZ_IO_BLOB_DRIVER=vercel   Vercel Blob (default; previews and production)
//   OWINZ_IO_BLOB_DRIVER=local    files under .data/blob/, for offline development
import { randomBytes } from "crypto";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { del, get, put } from "@vercel/blob";
import { imageContentType } from "./images";

export interface StoredBlob {
  url: string;
  pathname: string;
}

interface BlobDriver {
  upload(pathname: string, body: Buffer, contentType: string): Promise<StoredBlob>;
  read(pathname: string): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null>;
  remove(pathnames: string[]): Promise<void>;
}

/** "writing/post/photo.jpg" → "writing/post/photo-k3j9x2.jpg", so replacing a photo never collides. */
function withSuffix(pathname: string): string {
  const ext = path.extname(pathname);
  return `${pathname.slice(0, pathname.length - ext.length)}-${randomBytes(6).toString("base64url")}${ext}`;
}

// --- Vercel Blob ---------------------------------------------------------------
// The Vercel ↔ Blob integration prefixes its variables with OWINZ_IO_.
const TOKEN_VAR = "OWINZ_IO_READ_WRITE_TOKEN";

/**
 * Must match the store's access setting. Private by default: the site serves
 * every photo through its own routes, so nothing needs a public Blob URL.
 */
const BLOB_ACCESS: "public" | "private" =
  process.env.OWINZ_IO_BLOB_ACCESS === "public" ? "public" : "private";

function token(): string {
  const value = process.env[TOKEN_VAR];
  if (!value?.startsWith("vercel_blob_rw_")) {
    throw new Error(
      `${TOKEN_VAR} is ${value ? "not a Blob read-write token" : "not set"}. ` +
        "Vercel can't download Sensitive variables; for local development set OWINZ_IO_BLOB_DRIVER=local " +
        "or paste the store's token into .env.local. See README → CMS.",
    );
  }
  return value;
}

const vercelDriver: BlobDriver = {
  async upload(pathname, body, contentType) {
    const blob = await put(pathname, body, { access: BLOB_ACCESS, token: token(), contentType, addRandomSuffix: true });
    return { url: blob.url, pathname: blob.pathname };
  },
  async read(pathname) {
    const result = await get(pathname, { access: BLOB_ACCESS, token: token() });
    if (!result || result.statusCode !== 200) return null;
    return { stream: result.stream, contentType: result.blob.contentType };
  },
  async remove(pathnames) {
    if (pathnames.length) await del(pathnames, { token: token() });
  },
};

// --- Local folder ----------------------------------------------------------------
const LOCAL_ROOT = path.join(process.cwd(), ".data", "blob");

function localFile(pathname: string): string {
  const file = path.resolve(LOCAL_ROOT, pathname);
  if (!file.startsWith(LOCAL_ROOT + path.sep)) throw new Error(`Invalid blob path: ${pathname}`);
  return file;
}

const localDriver: BlobDriver = {
  async upload(pathname, body) {
    const stored = withSuffix(pathname);
    const file = localFile(stored);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    return { url: `local://${stored}`, pathname: stored };
  },
  async read(pathname) {
    try {
      const data = await readFile(localFile(pathname));
      return { stream: new Blob([new Uint8Array(data)]).stream(), contentType: imageContentType(pathname) };
    } catch {
      return null;
    }
  },
  async remove(pathnames) {
    await Promise.all(pathnames.map((p) => rm(localFile(p), { force: true })));
  },
};

const driver = (): BlobDriver => (process.env.OWINZ_IO_BLOB_DRIVER === "local" ? localDriver : vercelDriver);

export const uploadBlob = (pathname: string, body: Buffer, contentType: string) =>
  driver().upload(pathname, body, contentType);

export const readBlob = (pathname: string) => driver().read(pathname);

/** Best effort: a leftover file costs storage, never correctness. */
export async function removeBlobs(pathnames: string[]): Promise<void> {
  try {
    await driver().remove(pathnames);
  } catch (err) {
    console.warn("Couldn't remove stored photos:", pathnames, err);
  }
}
