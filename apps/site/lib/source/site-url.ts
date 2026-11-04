/**
 * Absolute URLs for machine-readable files (llms.txt, page actions), which leave the site and
 * cannot rely on Next.js adding the base path. Matches the Astro site's canonical origin.
 */
const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL;

export const siteOrigin = (
  process.env.SITE_URL ??
  (vercelProduction ? "https://" + vercelProduction : "https://opendil.com")
).replace(/\/+$/, "");

/** Set from SITE_BASE_PATH by next.config.ts, for example "/opendil"; empty at the root. */
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** `path` starts with "/" and excludes the base path. */
export function absoluteUrl(path: string): string {
  return siteOrigin + basePath + path;
}
