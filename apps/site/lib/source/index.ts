import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";

/** The docs tree. Next.js adds the base path to these URLs. */
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});

/** The page's Markdown URL, rewritten by next.config.ts to its llms.mdx route. */
export function markdownUrl(page: { url: string }): string {
  return page.url.replace(/\/$/, "") + ".md";
}
