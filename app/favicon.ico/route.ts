import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-static";

const SIZES = [16, 32, 48];
const LOGO_DIR = path.join(process.cwd(), "public", "png-logo");

// Packs the logo PNGs into a multi-size .ico (PNG-in-ICO, supported by every
// current browser and by Google's favicon crawler).
export async function GET() {
  const images = await Promise.all(
    SIZES.map((size) => readFile(path.join(LOGO_DIR, `do-monogram-${size}.png`))),
  );

  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = header.length;
  images.forEach((png, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(SIZES[i], entry); // width
    header.writeUInt8(SIZES[i], entry + 1); // height
    header.writeUInt8(0, entry + 2); // palette size
    header.writeUInt8(0, entry + 3); // reserved
    header.writeUInt16LE(1, entry + 4); // color planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });

  return new Response(Buffer.concat([header, ...images]), {
    headers: { "Content-Type": "image/x-icon" },
  });
}
