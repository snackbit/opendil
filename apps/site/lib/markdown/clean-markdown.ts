import {
  replaceSource,
  type Stringifier,
} from "fumadocs-core/mdx-plugins/stringifier";
import type { VFile } from "vfile";
import { customizationDocsSource } from "../../components/docs/customization-source";
import { exampleById, isExampleId } from "../examples/catalog";
import { pageSource } from "../examples/sources";
import {
  attribute,
  jsxChildren,
  type JsxElement,
  stringAttribute,
} from "./jsx";

/*
 * replaceSource handlers that turn the docs components into plain Markdown for
 * the .md routes and llms-full.txt. Each output is what a reader without the
 * interactive page needs: tab panels become headings, steps a numbered list,
 * callouts GitHub alerts, and live examples their DIL source. Links stay
 * root-relative like authored ones; the Markdown routes make them absolute.
 */

const renderModes = ["shadow", "host", "isolated"];
const alerts: Record<string, string> = {
  info: "NOTE",
  warn: "WARNING",
  warning: "WARNING",
  error: "CAUTION",
  idea: "TIP",
  success: "TIP",
};

function inner(s: Stringifier, node: JsxElement) {
  return s.inner(node).trim();
}

function blockquote(text: string) {
  return text
    .split("\n")
    .map((line) => (line ? "> " + line : ">"))
    .join("\n");
}

/** A fenced block long enough to hold any backtick run in `source`. */
function fence(language: string, source: string, title?: string) {
  const longest = Math.max(
    0,
    ...(source.match(/`+/g) ?? []).map((run) => run.length),
  );
  const ticks = "`".repeat(Math.max(3, longest + 1));
  const meta = title ? ` title="${title.replaceAll('"', "'")}"` : "";
  return `${ticks}${language}${meta}\n${source.replace(/\n$/, "")}\n${ticks}`;
}

function tabs(file: VFile, node: JsxElement, depth: number) {
  const items = attribute(node, "items");
  const panels = jsxChildren(node, "Tab");
  replaceSource(file, node, (s) =>
    panels
      .map((panel, index) => {
        const value = attribute(panel, "value");
        const label =
          (typeof value === "string" && value) ||
          (Array.isArray(items) && items[index]) ||
          `Option ${index + 1}`;
        return `${"#".repeat(depth)} ${label}\n\n${inner(s, panel)}`;
      })
      .join("\n\n"),
  );
}

function steps(file: VFile, node: JsxElement) {
  const items = jsxChildren(node, "Step");
  replaceSource(file, node, (s) =>
    items
      .map((step, index) => {
        const marker = `${index + 1}. `;
        // A step's leading heading becomes its bold lead-in, without the heading ID.
        const [first = "", ...rest] = inner(s, step)
          .replace(/^#{1,6}\s+(.+?)(?:\s*\[#[^\]]+\])?(?=\n|$)/, "**$1**")
          .split("\n");
        const indent = " ".repeat(marker.length);
        return [
          marker + first,
          ...rest.map((line) => (line ? indent + line : "")),
        ].join("\n");
      })
      .join("\n\n"),
  );
}

function callout(file: VFile, node: JsxElement) {
  const type = attribute(node, "type");
  const title = attribute(node, "title");
  const kind = alerts[typeof type === "string" ? type : "info"] ?? "NOTE";
  replaceSource(file, node, (s) => {
    const heading = typeof title === "string" && title ? `\n**${title}**` : "";
    return blockquote(`[!${kind}]${heading}\n\n${inner(s, node)}`);
  });
}

function card(file: VFile, node: JsxElement) {
  const title = attribute(node, "title");
  const href = attribute(node, "href");
  const description = attribute(node, "description");
  replaceSource(file, node, (s) => {
    const label = typeof title === "string" ? title : "Link";
    const link =
      typeof href === "string" && href ? `[${label}](${href})` : label;
    const text = [description, inner(s, node)]
      .filter((part) => typeof part === "string" && part)
      .join(" ");
    return `- ${link}${text ? ": " + text : ""}`;
  });
}

function liveExample(file: VFile, node: JsxElement) {
  const id = stringAttribute(file, node, "id");
  if (!isExampleId(id))
    return file.fail(`<LiveExample id="${id}"> is not an example`, node);
  const mode = attribute(node, "mode");
  if (mode !== undefined && !renderModes.includes(mode as string))
    return file.fail(
      `<LiveExample mode> must be ${renderModes.join(", ")}`,
      node,
    );
  const { title } = exampleById(id);
  const source = pageSource(id);
  replaceSource(
    file,
    node,
    source === null
      ? `The ${title} example builds its source in the browser: [open it in the playground](/demo/${id}/).`
      : fence("dil", source, title),
  );
}

function sourceDisclosure(file: VFile, node: JsxElement) {
  const label = stringAttribute(file, node, "label");
  replaceSource(file, node, (s) => `**${label}**\n\n${inner(s, node)}`);
}

/**
 * Registers the Markdown output of one authored JSX element. `depth` is the level
 * for headings it produces. Unknown elements keep only their children.
 */
export function cleanMarkdown(file: VFile, node: JsxElement, depth: number) {
  switch (node.name) {
    case "Tabs":
      return tabs(file, node, depth);
    case "Steps":
      return steps(file, node);
    case "Callout":
      return callout(file, node);
    case "Card":
      return card(file, node);
    case "LiveExample":
      return liveExample(file, node);
    case "SourceDisclosure":
      return sourceDisclosure(file, node);
    case "CustomizationPlayground":
      return replaceSource(
        file,
        node,
        fence("dil", customizationDocsSource, "Custom components"),
      );
    default:
      return replaceSource(file, node, (s) => inner(s, node));
  }
}
