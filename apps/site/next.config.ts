import { fileURLToPath } from "node:url";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";
import { assetRedirects, redirects, specRedirects } from "./redirects";

/** Deploy under a subpath with SITE_BASE_PATH=/opendil. Fumadocs and Next.js add it to links themselves. */
const basePath = process.env.SITE_BASE_PATH?.replace(/\/+$/, "") ?? "";
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

const config: NextConfig = {
  reactStrictMode: true,
  ...(basePath ? { basePath } : {}),
  // A separate output directory lets a subpath build run next to the root build.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  trailingSlash: true,
  // The renderer's runtimeBaseUrl and raw links are not rewritten by Next.js; they read this.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // Resolve the symlinked workspace packages (packages/opendil) from the repository root.
  turbopack: { root: workspaceRoot },
  outputFileTracingRoot: workspaceRoot,
  agentRules: false,
  async redirects() {
    return [...redirects, ...assetRedirects, ...specRedirects];
  },
  async rewrites() {
    return [
      { source: "/docs.md", destination: "/llms.mdx/docs/" },
      { source: "/docs/:path*.md", destination: "/llms.mdx/docs/:path*/" },
    ];
  },
  async headers() {
    return [
      {
        // The opaque-origin frame: scripts only, embeddable by this site only.
        source: "/opendil/frame.html",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "sandbox allow-scripts; frame-ancestors 'self'",
          },
        ],
      },
      // The .md route handlers set text/markdown themselves; a header rule here would also label 404 pages.
    ];
  },
};

export default createMDX()(config);
