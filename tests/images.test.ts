import { describe, it, expect } from "vitest";
import path from "path";
import sharp from "sharp";
import { getWritingPost, getWritingPosts } from "../lib/markdown";
import { MAX_IMAGE_WIDTH, processImage } from "../lib/images";

const FIXTURE_WRITING = path.join(__dirname, "fixtures", "content-photos", "writing");
const PHOTO_DIR = path.join(FIXTURE_WRITING, "photo-post");

describe("folder-style posts", () => {
  it("loads <slug>/index.md alongside <slug>.md", async () => {
    const slugs = (await getWritingPosts(FIXTURE_WRITING)).map((p) => p.slug);
    expect(slugs.sort()).toEqual(["flat", "photo-post"]);
    expect((await getWritingPost("photo-post", FIXTURE_WRITING))?.title).toBe("A post with photos");
  });

  it("publishes only the local photos the post references", async () => {
    const post = await getWritingPost("photo-post", FIXTURE_WRITING);
    expect(post?.images.map((img) => img.name).sort()).toEqual(["rotated.jpg", "small.png", "wide.jpg"]);
  });
});

describe("article image HTML", () => {
  it("wraps standalone images in a figure, with the title as caption", async () => {
    const { content } = (await getWritingPost("photo-post", FIXTURE_WRITING))!;
    expect(content).toMatch(
      /<figure><img src="\/writing\/photo-post\/wide\.jpg" alt="A wide purple test photo"[^>]*><figcaption>A caption for the wide photo<\/figcaption><\/figure>/,
    );
    // No caption → figure without figcaption; no leftover title tooltip.
    expect(content).toMatch(/<figure><img src="\/writing\/photo-post\/rotated\.jpg"[^>]*><\/figure>/);
    expect(content).not.toContain('title="');
    // Inline images stay inline.
    expect(content).toMatch(/<p>Text with an inline <img src="\/writing\/photo-post\/small\.png"/);
  });

  it("floats #left / #right images, dropping the fragment from the URL", async () => {
    const { content, images } = (await getWritingPost("photo-post", FIXTURE_WRITING))!;
    expect(content).toMatch(
      /<figure class="align-right"><img src="\/writing\/photo-post\/small\.png" alt="Floated swatch"[^>]*><figcaption>Floated caption<\/figcaption><\/figure>/,
    );
    expect(content).toMatch(/<figure class="align-left"><img src="\/writing\/photo-post\/small\.png" alt="Left swatch"/);
    expect(content).not.toContain("#right");
    expect(images.filter((img) => img.name === "small.png")).toHaveLength(1);
  });

  it("adds shipped dimensions and lazy loading", async () => {
    const { content } = (await getWritingPost("photo-post", FIXTURE_WRITING))!;
    const img = (name: string) => content.match(new RegExp(`<img src="[^"]*${name}"[^>]*>`))?.[0] ?? "";
    // 3200×1600 is capped to the max width.
    expect(img("wide.jpg")).toContain(`width="${MAX_IMAGE_WIDTH}" height="800"`);
    // 800×400 stored with EXIF "rotate 90°" ships as 400×800.
    expect(img("rotated.jpg")).toContain('width="400" height="800"');
    expect(img("wide.jpg")).toContain('loading="lazy"');
  });

  it("leaves remote and root-relative images where they are", async () => {
    const photo = (await getWritingPost("photo-post", FIXTURE_WRITING))!;
    expect(photo.content).toContain('src="https://example.org/remote.png"');
    const flat = (await getWritingPost("flat", FIXTURE_WRITING))!;
    expect(flat.content).toMatch(/<figure><img src="\/self-portrait\.svg"[^>]*><figcaption>Portrait caption<\/figcaption><\/figure>/);
    expect(flat.images).toEqual([]);
  });

  it("makes local image paths absolute in the markdown for llms-full.txt", async () => {
    const { markdown } = (await getWritingPost("photo-post", FIXTURE_WRITING))!;
    expect(markdown).toContain("](https://owinz.io/writing/photo-post/wide.jpg");
    expect(markdown).toContain("](https://owinz.io/writing/photo-post/rotated.jpg)");
    expect(markdown).toContain("](https://example.org/remote.png)");
  });
});

describe("processImage", () => {
  it("caps the width", async () => {
    const meta = await sharp(await processImage(path.join(PHOTO_DIR, "wide.jpg"))).metadata();
    expect([meta.width, meta.height]).toEqual([MAX_IMAGE_WIDTH, 800]);
  });

  it("applies EXIF rotation and strips metadata", async () => {
    const meta = await sharp(await processImage(path.join(PHOTO_DIR, "rotated.jpg"))).metadata();
    expect([meta.width, meta.height]).toEqual([400, 800]);
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });
});
