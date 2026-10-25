import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages are prerendered and cached; publishing from the CMS refreshes the
  // affected cache tags instead of requiring a rebuild (lib/content).
  cacheComponents: true,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
