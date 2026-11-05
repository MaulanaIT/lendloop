import type { NextConfig } from "next";

// Data is fetched client-side through Convex's realtime queries and auth runs
// through Clerk, so server component caching (cacheComponents) buys nothing
// here and would force Suspense boundaries around every auth read.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
