import { absoluteUrl } from "./site-url";
import { specFiles } from "./spec-files";

/*
 * The .md twins and llms-full.txt leave the site, so their links must work without it:
 * site paths become absolute URLs with the base path, and docs pages point at their
 * Markdown twins instead of the HTML pages.
 */

/** A docs page path such as /docs/limits/ or /docs/; paths with a file extension are left alone. */
const docsPage = /^\/docs(?:\/[^.]*)?$/;

/** The URL an agent should fetch for a link target written in the docs, or undefined to keep it. */
export function agentUrl(target: string): string | undefined {
  const [, path = "", suffix = ""] = /^([^?#]*)(.*)$/.exec(target) ?? [];
  // The full spec links its sibling files by name; on this site they live at the spec URLs.
  const spec = specFiles.find((entry) => entry.file === path);
  if (spec) return absoluteUrl(spec.url) + suffix;
  if (!path.startsWith("/") || path.startsWith("//")) return undefined;
  if (docsPage.test(path))
    return absoluteUrl(path.replace(/\/$/, "") + ".md") + suffix;
  return absoluteUrl(path) + suffix;
}

const inlineLink = /\]\(([^)\s]+)/g;
const referenceDefinition = /^( {0,3}\[[^\]]+\]:[ \t]*)(\S+)/;
const fence = /^\s*(`{3,}|~{3,})/;

function rewriteTargets(text: string): string {
  return text.replace(
    inlineLink,
    (match, target: string) => `](${agentUrl(target) ?? target}`,
  );
}

/** Rewrites inline links and link definitions; fenced code and inline code stay as written. */
export function rewriteMarkdownLinks(markdown: string): string {
  let openFence: string | undefined;
  return markdown
    .split("\n")
    .map((line) => {
      const marker = fence.exec(line)?.[1];
      if (openFence) {
        if (
          marker &&
          marker[0] === openFence[0] &&
          marker.length >= openFence.length
        )
          openFence = undefined;
        return line;
      }
      if (marker) {
        openFence = marker;
        return line;
      }
      const definition = referenceDefinition.exec(line);
      if (definition) {
        const target = agentUrl(definition[2]!) ?? definition[2]!;
        return definition[1] + target + line.slice(definition[0].length);
      }
      // Odd segments are code spans.
      return line
        .split(/(`[^`]*`)/)
        .map((segment, index) =>
          index % 2 === 1 ? segment : rewriteTargets(segment),
        )
        .join("");
    })
    .join("\n");
}
