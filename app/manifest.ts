import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.title,
    short_name: "owinz.io",
    description: SITE.description,
    start_url: "/",
    display: "standalone",
    background_color: "#f8f7f4",
    theme_color: "#f3f1ec",
    icons: [
      { src: "/png-logo/do-monogram-192.png", sizes: "192x192", type: "image/png" },
      { src: "/png-logo/do-monogram-512.png", sizes: "512x512", type: "image/png" },
      // The 512 logo is opaque and its mark stays inside the maskable safe zone.
      { src: "/png-logo/do-monogram-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
