import type { Block, Inline } from "./model";

// Built from the model only: no attributes beyond href, src, alt, start, and a
// code language class reach the output, so it carries no handlers or ids.
function text(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function attribute(value: string) {
  return text(value).replace(/"/g, "&quot;");
}
const TAGS = { strong: "strong", emphasis: "em", deleted: "del" } as const;
function inline(children: Inline[]): string {
  return children
    .map((child) => {
      switch (child.kind) {
        case "text":
          return text(child.value);
        case "strong":
        case "emphasis":
        case "deleted": {
          const tag = TAGS[child.kind];
          return `<${tag}>${inline(child.children)}</${tag}>`;
        }
        case "code":
          return `<code>${text(child.value)}</code>`;
        case "link":
          return `<a href="${attribute(child.href)}">${inline(child.children)}</a>`;
        case "image":
          return `<img src="${attribute(child.src)}" alt="${attribute(child.alt)}">`;
        case "break":
          return "<br>";
        case "mark":
          return child.control === "check"
            ? child.checked
              ? "☑"
              : "☐"
            : child.checked
              ? "◉"
              : "○";
      }
    })
    .join("");
}
function cells(row: Inline[][], tag: "th" | "td") {
  return (
    "<tr>" +
    row.map((cell) => `<${tag}>${inline(cell)}</${tag}>`).join("") +
    "</tr>"
  );
}
function write(block: Block): string {
  switch (block.kind) {
    case "paragraph":
      return `<p>${inline(block.children)}</p>`;
    case "heading":
      return `<h${block.level}>${inline(block.children)}</h${block.level}>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const start =
        block.ordered && block.start !== 1 ? ` start="${block.start}"` : "";
      const items = block.items
        .map((item) => `<li>${item.map(write).join("")}</li>`)
        .join("");
      return `<${tag}${start}>${items}</${tag}>`;
    }
    case "quote":
      return `<blockquote>${block.children.map(write).join("")}</blockquote>`;
    case "code": {
      const language = /^[\w+#.-]+$/.test(block.language)
        ? ` class="language-${block.language}"`
        : "";
      return `<pre><code${language}>${text(block.value)}</code></pre>`;
    }
    case "table":
      return (
        "<table>" +
        (block.header ? `<thead>${cells(block.header, "th")}</thead>` : "") +
        `<tbody>${block.rows.map((row) => cells(row, "td")).join("")}</tbody>` +
        "</table>"
      );
    case "rule":
      return "<hr>";
  }
}
export function writeHtml(blocks: Block[]): string {
  return blocks.map(write).join("");
}
