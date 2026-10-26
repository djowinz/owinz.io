// Exports every post (drafts too) from the database as Markdown with its
// photos, in content/'s folder layout, so it can be backed up, edited as
// files, or re-imported with `pnpm content:import <dir>`.
//
//   pnpm content:export              → .data/export/
//   pnpm content:export <dir>        → <dir>/writing/<slug>/index.md + photos
//
// Each post's folder is replaced; other files in <dir> are left alone.
import path from "path";
import { readBlob } from "../lib/blob";
import { exportPostsToDir } from "../lib/cms/export-files";
import { getDb } from "../lib/db";

async function main() {
  const dir = path.resolve(process.argv[2] ?? path.join(".data", "export"));
  const posts = await exportPostsToDir(getDb(), dir, readBlob);
  for (const post of posts) {
    console.log(
      `writing/${post.slug} (${post.status})`,
      post.photos.length ? `${post.photos.length} photo${post.photos.length === 1 ? "" : "s"}` : "",
      post.missing.length ? `— missing from storage: ${post.missing.join(", ")}` : "",
    );
  }
  console.log(`\nexported ${posts.length} posts to ${path.relative(process.cwd(), dir) || "."}`);
  process.exit(posts.some((p) => p.missing.length) ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
