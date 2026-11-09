import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { toString } from "mdast-util-to-string";
import type { Nodes } from "mdast";
import { DilParser } from "../parser/dil-parser";
import type { DilNode } from "../parser/types";
import { decodeLiteralMarkdown } from "../markdown/literal-markdown";

export interface DilComponentReference {
  name: string;
  /**
   * Attributes written as quoted strings or JSON string literals such as
   * `{"report"}`, the values a host component receives. Other expressions are
   * not read.
   */
  literalAttributes: Readonly<Record<string, string>>;
}
export interface DilTextOptions {
  /** Characters of text to return. Defaults to 2,000. */
  maxLength?: number;
  /** Characters of source to read. Defaults to 1 MiB. */
  maxSourceLength?: number;
}
export interface DilTextResult {
  text: string;
  /** Text or source was cut at its limit. */
  truncated: boolean;
  /** Host components the source uses, in document order. */
  components: DilComponentReference[];
}
// Capitalized stock components; any other capitalized tag is a host component.
// tests/unit/text-extraction.test.ts keeps this list equal to the stock registry.
export const STOCK_COMPONENTS: ReadonlySet<string> = new Set([
  "AsyncImage",
  "Chart",
  "CodeBlock",
  "Markdown",
  "Mermaid",
  "NodeGraph",
]);
const TEXT_ATTRIBUTES = ["label", "title", "caption"];
/** Source code and drawings are not reading text. */
const SKIPPED = new Set(["CodeBlock", "svg"]);
const CONTAINERS: ReadonlySet<string> = new Set([
  "list",
  "listItem",
  "blockquote",
  "table",
]);
const markdownParser = unified().use(remarkParse).use(remarkGfm);

function jsonValue(source: string | undefined): unknown {
  if (source === undefined) return undefined;
  try {
    return JSON.parse(source.trim());
  } catch {
    return undefined;
  }
}
/** A JSON string literal, which host components receive as that string. */
function jsonString(source: string | undefined): string | undefined {
  const value = jsonValue(source);
  return typeof value === "string" ? value : undefined;
}
/** The text a JSON string or number literal spells; other expressions are not read. */
function literalText(source: string | undefined): string | undefined {
  const value = jsonValue(source);
  if (typeof value === "string") return value;
  return typeof value === "number" ? String(value) : undefined;
}
function markdownBlocks(node: Nodes, out: string[]) {
  if (node.type === "code") return;
  if (node.type === "root" || CONTAINERS.has(node.type)) {
    if ("children" in node)
      for (const child of node.children) markdownBlocks(child, out);
    return;
  }
  // A table row reads as one line of cells; other blocks are one line each.
  const text =
    node.type === "tableRow"
      ? node.children.map((cell) => toString(cell)).join(" ")
      : toString(node);
  out.push(text);
}
/**
 * Reads the text of a DIL document without running it: no worker, no
 * QuickJS, and no React. It includes Markdown prose, `<Markdown>` bodies,
 * JSON string literals such as `{"Revenue"}`, and label, title, and caption
 * attributes. It skips CodeBlock, fenced code, SVG, and expressions.
 */
export function extractDilText(
  source: string,
  { maxLength = 2000, maxSourceLength = 1 << 20 }: DilTextOptions = {},
): DilTextResult {
  let truncated = source.length > maxSourceLength;
  const parser = new DilParser();
  const { links, issues } = parser.append(
    source.slice(0, maxSourceLength),
    true,
  );
  truncated ||= issues.some((issue) => issue.kind === "limit");
  const nodes = parser.snapshot();
  const children = new Map<number, number[]>();
  for (const { parent, child } of links) {
    const list = children.get(parent);
    if (list) list.push(child);
    else children.set(parent, [child]);
  }
  const pieces: string[] = [];
  let length = 0;
  const components: DilComponentReference[] = [];
  const add = (text: string | undefined) => {
    if (!text) return;
    if (length >= maxLength) {
      truncated = true;
      return;
    }
    length += text.length + (pieces.length ? 1 : 0);
    pieces.push(text);
  };
  const addMarkdown = (text: string, expressions?: readonly string[]) => {
    const blocks: string[] = [];
    markdownBlocks(markdownParser.parse(text), blocks);
    for (const block of blocks)
      add(
        (expressions
          ? block.replace(
              /DILX(\d+)END/g,
              (_match, index: string) =>
                literalText(expressions[Number(index)]) ?? "",
            )
          : block
        ).trim(),
      );
  };
  const root = nodes[0];
  const stack: DilNode[] = root ? [root] : [];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.kind === "markdown") {
      addMarkdown(node.text, node.expressions);
      continue;
    }
    if (node.kind === "element") {
      if (/^[A-Z]/.test(node.name) && !STOCK_COMPONENTS.has(node.name))
        components.push({
          name: node.name,
          literalAttributes: Object.fromEntries(
            Object.entries(node.attributes).flatMap(([name, attribute]) => {
              const value =
                typeof attribute.literal === "string"
                  ? attribute.literal
                  : jsonString(attribute.expression);
              return value === undefined ? [] : [[name, value]];
            }),
          ),
        });
      for (const name of TEXT_ATTRIBUTES) {
        const attribute = node.attributes[name];
        add(
          typeof attribute?.literal === "string"
            ? attribute.literal
            : literalText(attribute?.expression),
        );
      }
      if (node.name === "Markdown") {
        addMarkdown(decodeLiteralMarkdown(node.text));
        continue;
      }
      if (SKIPPED.has(node.name)) continue;
    }
    // Reverse the push order so a depth-first walk preserves source order.
    for (const id of [...(children.get(node.id) ?? [])].reverse()) {
      const child = nodes[id];
      if (child) stack.push(child);
    }
  }
  let text = pieces.join("\n");
  if (text.length > maxLength) {
    truncated = true;
    text = text.slice(0, maxLength);
    // Never end on half of a surrogate pair.
    if (/[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
  }
  return { text, truncated, components };
}
