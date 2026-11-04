import type { RootContent } from "mdast";
import type { MdxJsxFlowElement } from "mdast-util-mdx-jsx";
import {
  embedSource,
  markdownTable,
  replaceSource,
} from "fumadocs-core/mdx-plugins/stringifier";
import type { VFile } from "vfile";
import { componentSpec, type ComponentSpec } from "../spec/components";
import {
  isSpecFile,
  readSpecFile,
  specPages,
  specPath,
  type SpecFile,
} from "../spec/files";
import { type JsxElement, stringAttribute } from "./jsx";
import { parseMarkdown } from "./parse-markdown";

/*
 * <ComponentProps>, <SpecExcerpt> and <SpecDocument> expand at build time into
 * Markdown parsed from the spec. The parsed nodes are embedded with their source,
 * so search records, the table of contents and the .md output all include them.
 */

const childCategories: Record<string, string> = {
  inline: "text, inline Markdown, and inline components",
  generic: "inline or block content",
  raw: "literal source, not parsed as DIL",
  none: "no content",
};

/** Inline code that may sit in a table cell. */
function code(value: string) {
  const ticks = "`".repeat(
    Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length)) + 1,
  );
  const padded =
    value.startsWith("`") || value.endsWith("`") ? ` ${value} ` : value;
  return ticks + padded.replaceAll("|", "\\|") + ticks;
}

function cellText(value: string) {
  return value.replaceAll("|", "\\|");
}

/** Short literal defaults read as code; prose defaults such as "no marks" stay text. */
function defaultCell(value: string | undefined) {
  if (!value) return "";
  return /^[\w.#%-]+$/.test(value) ? code(value) : cellText(value);
}

export function componentPropsMarkdown(spec: ComponentSpec): string {
  const category = childCategories[spec.children];
  // The shared layout props ("layout") have no children line.
  const children = !spec.children
    ? ""
    : "\n\n**Children:** " +
      (category
        ? code(spec.children) + ": " + category + "."
        : cellText(spec.children));
  if (!spec.attributes.length)
    return "This component takes no attributes." + children;
  const rows = spec.attributes.map((item) => [
    code(item.name),
    code(item.type),
    defaultCell(item.defaultValue),
    cellText(item.description),
  ]);
  return (
    markdownTable([["Attribute", "Type", "Default", "Description"], ...rows]) +
    children
  );
}

function addDependency(file: VFile, path: string) {
  const compiler = file.data._compiler as
    { addDependency?: (path: string) => void } | undefined;
  compiler?.addDependency?.(path);
}

function embed(file: VFile, node: JsxElement, markdown: string): RootContent[] {
  const content = parseMarkdown(markdown);
  embedSource(file, node, markdown, content);
  return content;
}

function blockquote(text: string) {
  return text
    .split("\n")
    .map((line) => (line ? "> " + line : ">"))
    .join("\n");
}

export function expandComponentProps(file: VFile, node: JsxElement) {
  const spec = componentSpec(stringAttribute(file, node, "name"));
  addDependency(file, specPath("genui.agent.full.md"));
  return embed(file, node, componentPropsMarkdown(spec));
}

/** The block's guidance in a "For the model" callout; a blockquote in Markdown output. */
export function expandSpecExcerpt(file: VFile, node: JsxElement) {
  const spec = componentSpec(stringAttribute(file, node, "name"));
  addDependency(file, specPath("genui.agent.full.md"));
  if (!spec.guidance) return [];
  const content = embed(file, node, spec.guidance);
  const first = content[0]!;
  const last = content[content.length - 1]!;
  replaceSource(file, node, (s) => {
    const start = s.range(first)?.start;
    const end = s.range(last)?.end;
    const body =
      start === undefined || end === undefined ? "" : s.slice(start, end);
    return blockquote("**For the model**\n\n" + body);
  });
  const callout: MdxJsxFlowElement = {
    type: "mdxJsxFlowElement",
    name: "Callout",
    attributes: [
      { type: "mdxJsxAttribute", name: "type", value: "idea" },
      { type: "mdxJsxAttribute", name: "title", value: "For the model" },
    ],
    children: content as MdxJsxFlowElement["children"],
  };
  return [callout];
}

/** A whole spec file; its title heading is dropped because the page has its own. */
export function expandSpecDocument(file: VFile, node: JsxElement) {
  const name = stringAttribute(file, node, "file");
  if (!isSpecFile(name))
    return file.fail(`<SpecDocument file="${name}"> is not a spec file`, node);
  addDependency(file, specPath(name as SpecFile));
  const text = readSpecFile(name).replace(/^# [^\n]*\n+/, "");
  const content = embed(file, node, text);
  linkSpecPages(content);
  return content;
}

/**
 * The spec files link each other by file name, which would resolve below the docs page.
 * Only the rendered nodes change: the embedded source keeps the file names, and the
 * Markdown output points them at the raw spec URLs (lib/source/markdown-links.ts).
 */
function linkSpecPages(nodes: readonly RootContent[]) {
  for (const node of nodes) {
    if (node.type === "link" || node.type === "definition") {
      const [target, hash] = node.url.split(/(?=#)/);
      if (isSpecFile(target)) node.url = specPages[target] + (hash ?? "");
    }
    if ("children" in node) linkSpecPages(node.children as RootContent[]);
  }
}
