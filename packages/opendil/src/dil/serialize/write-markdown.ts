import type { Block, Inline } from "./model";

// Characters that change meaning anywhere in Markdown text. Underscores matter
// only at word edges, where they can open or close emphasis.
const SPECIAL = /[\\`*[\]<~]|(?<![A-Za-z0-9])_|_(?![A-Za-z0-9])/g;
// Text at the start of a line that would read as a heading, list, or quote:
// these interrupt a paragraph, so lines after a hard break need it too.
const BLOCK_START = /^([ \t]*)(#{1,6}(?=\s|$)|[-+*](?=\s)|\d+(?=[.)]\s)|>)/gm;
function escape(text: string) {
  return text.replace(SPECIAL, (match) => "\\" + match);
}
/**
 * Where inline content goes: a paragraph, a single line such as a heading,
 * or a table cell, which also escapes its column separator.
 */
type Context = "prose" | "line" | "table";
function codeSpan(raw: string) {
  // A code span shows line endings as spaces; a newline could start a block.
  const value = raw.replace(/\r\n|\r|\n/g, " ");
  const longest = Math.max(
    0,
    ...[...value.matchAll(/`+/g)].map((match) => match[0].length),
  );
  const fence = "`".repeat(longest + 1);
  const padded = /^`|`$|^ .* $/.test(value) ? ` ${value} ` : value;
  return fence + padded + fence;
}
function destination(url: string) {
  return /[\s()<>]/.test(url)
    ? "<" + url.replace(/[<>]/g, encodeURI) + ">"
    : url;
}
function inline(children: Inline[], context: Context = "prose"): string {
  const table = context === "table";
  return children
    .map((child) => {
      switch (child.kind) {
        case "text": {
          const text = escape(child.value);
          return table ? text.replace(/\|/g, "\\|") : text;
        }
        case "strong":
          return "**" + inline(child.children, context) + "**";
        case "emphasis":
          return "*" + inline(child.children, context) + "*";
        case "deleted":
          return "~~" + inline(child.children, context) + "~~";
        case "code":
          return codeSpan(
            table ? child.value.replace(/\|/g, "\\|") : child.value,
          );
        case "link":
          return `[${inline(child.children, context)}](${destination(child.href)})`;
        case "image":
          return `![${escape(child.alt)}](${destination(child.src)})`;
        case "break":
          return context === "prose" ? "\\\n" : "<br>";
        case "mark":
          return child.control === "check"
            ? child.checked
              ? "[x]"
              : "[ ]"
            : child.checked
              ? "(x)"
              : "( )";
      }
    })
    .join("");
}
function prose(children: Inline[]) {
  // An ordered-list number is escaped at its delimiter: "1\." stays text.
  return inline(children).replace(
    BLOCK_START,
    (_match: string, space: string, marker: string) =>
      /^\d/.test(marker) ? `${space}${marker}\\` : `${space}\\${marker}`,
  );
}
function fence(value: string) {
  const longest = Math.max(
    2,
    ...[...value.matchAll(/^ {0,3}(`{3,}|~{3,})/gm)].map(
      (match) => match[1]?.length ?? 0,
    ),
  );
  return "`".repeat(longest + 1);
}
function indent(text: string, first: string, rest: string) {
  return text
    .split("\n")
    .map((line, index) => (index ? (line ? rest + line : "") : first + line))
    .join("\n");
}
function table(block: Extract<Block, { kind: "table" }>) {
  const width = Math.max(
    block.header?.length ?? 0,
    ...block.rows.map((row) => row.length),
  );
  const cells = (row: Inline[][]) =>
    "| " +
    Array.from({ length: width }, (_, index) =>
      inline(row[index] ?? [], "table"),
    ).join(" | ") +
    " |";
  const header = block.header ?? [];
  return [
    cells(header),
    "| " + Array.from({ length: width }, () => "---").join(" | ") + " |",
    ...block.rows.map(cells),
  ].join("\n");
}
function write(block: Block): string {
  switch (block.kind) {
    case "paragraph":
      return prose(block.children);
    case "heading":
      return "#".repeat(block.level) + " " + inline(block.children, "line");
    case "list":
      return block.items
        .map((item, index) => {
          const marker = block.ordered ? `${block.start + index}. ` : "- ";
          // A nested list continues its item; other blocks make it loose.
          const body = item
            .map((child, at) =>
              at
                ? (child.kind === "list" ? "\n" : "\n\n") + write(child)
                : write(child),
            )
            .join("");
          return indent(body, marker, " ".repeat(marker.length));
        })
        .join("\n");
    case "quote":
      return block.children
        .map(write)
        .join("\n\n")
        .split("\n")
        .map((line) => (line ? "> " + line : ">"))
        .join("\n");
    case "code": {
      const marker = fence(block.value);
      return `${marker}${block.language}\n${block.value}\n${marker}`;
    }
    case "table":
      return table(block);
    case "rule":
      return "---";
  }
}
export function writeMarkdown(blocks: Block[]): string {
  return blocks.map(write).join("\n\n");
}
