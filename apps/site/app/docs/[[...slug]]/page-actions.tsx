"use client";
import {
  MarkdownCopyButton,
  ViewOptionsPopover,
} from "fumadocs-ui/layouts/docs/page";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Copy Markdown, View as Markdown, and Open in ChatGPT/Claude. The chat prompts link the page's
 * .md URL (on the current origin) so the assistant reads clean Markdown instead of the HTML page.
 */
export function PageActions({
  markdownUrl,
  githubUrl,
}: {
  markdownUrl: string;
  githubUrl: string;
}) {
  // Only the closed popover uses pageUrl, so the server value never reaches the HTML.
  const pageUrl =
    typeof window === "undefined"
      ? basePath + markdownUrl
      : new URL(basePath + markdownUrl, window.location.href).href;
  return (
    <div className="flex flex-row items-center gap-2 border-b pb-6">
      <MarkdownCopyButton markdownUrl={markdownUrl} />
      <ViewOptionsPopover
        markdownUrl={markdownUrl}
        githubUrl={githubUrl}
        pageUrl={pageUrl}
      />
    </div>
  );
}
