import { flattenTree, type Node } from "fumadocs-core/page-tree";
import { markdownUrl, source } from "./index";
import { rewriteMarkdownLinks } from "./markdown-links";
import { absoluteUrl } from "./site-url";
import { specFiles, specText } from "./spec-files";

type DocsPage = ReturnType<typeof source.getPages>[number];

function markdownLink(title: string, url: string): string {
  return `[${title.replace(/([\\[\]])/g, "\\$1")}](${url})`;
}

function listItem(title: string, url: string, description = ""): string {
  const link = markdownLink(title, url);
  return description.trim() ? `- ${link}: ${description.trim()}` : `- ${link}`;
}

function pageItem(page: DocsPage): string {
  return listItem(
    page.data.title,
    absoluteUrl(markdownUrl(page)),
    page.data.description,
  );
}

/** Sidebar order: separators become headings, folders indent their pages; empty groups are dropped. */
function treeLines(nodes: Node[], indent: string): string[] {
  const lines: string[] = [];
  let heading: string[] = [];
  const add = (entries: string[]) => {
    if (entries.length === 0) return;
    lines.push(...heading, ...entries);
    heading = [];
  };
  for (const node of nodes) {
    if (node.type === "separator") {
      heading =
        typeof node.name === "string" ? ["", `### ${node.name}`, ""] : [];
    } else if (node.type === "page") {
      const page = source.getNodePage(node);
      if (page) add([indent + pageItem(page)]);
    } else {
      const children = treeLines(node.children, indent + "  ");
      const index = node.index && source.getNodePage(node.index);
      if (index) add([indent + pageItem(index), ...children]);
      else if (children.length > 0 && typeof node.name === "string")
        add([`${indent}- ${node.name}`, ...children]);
    }
  }
  return lines;
}

/** llms.txt: the agent spec for apps first, then the docs for coding agents. */
export function llmsIndex(): string {
  const lines = [
    "# OpenDIL",
    "",
    "> OpenDIL streams interactive documents from language models into React. A model writes DIL (Markdown with UI components and expressions), and the OpenDIL renderer runs it in a sandbox while it streams.",
    "",
    "Two kinds of reader use these files, and they need different ones:",
    "",
    "- **A model inside an app** that renders OpenDIL output needs the Agent Spec. The app puts it in that model's system prompt so the model writes valid DIL. It describes the language, not the React package.",
    "- **A coding agent building or changing such an app** needs the docs. They cover installing `@snackbit/opendil`, wiring the renderer into a chat, streaming, theming and custom components. Give the Agent Spec to the app's model rather than following it yourself.",
    "",
    "## Agent Spec (for the model that writes DIL)",
    "",
    ...specFiles.map((spec) =>
      listItem(spec.title, absoluteUrl(spec.url), spec.description),
    ),
    "",
    "## Docs (for coding agents)",
    "",
    listItem(
      "All docs in one file",
      absoluteUrl("/llms-full.txt"),
      "Every page below, concatenated.",
    ),
    ...treeLines(source.getPageTree().children, ""),
  ];
  return lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

function withHeader(page: DocsPage, body: string): string {
  const description = page.data.description
    ? `> ${page.data.description}\n\n`
    : "";
  const text = `# ${page.data.title}\n\n${description}${body.trim()}\n`;
  return rewriteMarkdownLinks(text);
}

/** One docs page as Markdown, served at its .md URL. */
export async function pageMarkdown(page: DocsPage): Promise<string> {
  return withHeader(page, await page.data.getText("processed"));
}

/** Processed headings carry their ID, as in "## Setup [#setup]"; spec files have none. */
const headingId = /^(#{1,6} .*) \[#[^\]]+\]$/;

/** Replaces the lines of `body` in `lines`, ignoring heading IDs; unchanged when absent. */
function replaceLines(lines: string[], body: string[], replacement: string) {
  const plain = lines.map((line) => line.replace(headingId, "$1"));
  const start = plain.findIndex((line, index) =>
    body.every((expected, offset) => plain[index + offset] === expected),
  );
  if (start >= 0) lines.splice(start, body.length, replacement);
}

/**
 * Spec pages embed a whole spec file (<SpecDocument>). llms-full.txt is for coding agents,
 * which llms.txt sends to the raw spec files instead, so it keeps only the page's own prose.
 */
async function withoutSpecBodies(markdown: string): Promise<string> {
  const lines = markdown.split("\n");
  for (const spec of specFiles) {
    // <SpecDocument> drops the title heading; the page has its own.
    const text = (await specText(spec.file)).replace(/^# [^\n]*\n+/, "");
    replaceLines(
      lines,
      text.trimEnd().split("\n"),
      `*The page includes the ${spec.title} here. llms-full.txt leaves it out; fetch [${spec.url}](${spec.url}) for the full text.*`,
    );
  }
  return lines.join("\n");
}

/** llms-full.txt: the sidebar's pages in order, each headed by its .md URL. */
export async function llmsFull(): Promise<string> {
  const pages = flattenTree(source.getPageTree().children)
    .map((item) => source.getNodePage(item))
    .filter((page) => page !== undefined)
    .map(async (page) => {
      const body = await withoutSpecBodies(
        await page.data.getText("processed"),
      );
      return `<!-- Source: ${absoluteUrl(markdownUrl(page))} -->\n\n${withHeader(page, body)}`;
    });
  return (await Promise.all(pages)).join("\n");
}
