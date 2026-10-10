import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // jsdom (via sanitize-svg.ts) has a transitive ESM-only dependency
  // (html-encoding-sniffer -> @exodus/bytes) that the Turbopack serverless
  // bundle tries to `require()` as CJS and crashes on in production only —
  // excluding it from bundling lets Node's own module resolution (which
  // handles the ESM/CJS interop correctly) load it at runtime instead.
  serverExternalPackages: ["jsdom"],
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
