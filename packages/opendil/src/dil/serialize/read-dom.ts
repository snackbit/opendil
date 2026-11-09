import { chartCopy } from "./chart-copy";
import type { Block, Inline } from "./model";

/*
 * Reads what a renderer currently shows. Hints that widgets set:
 * - data-dil-copy="skip" omits a subtree; "include" keeps a visually hidden
 *   one; "content" keeps the content of an action, such as a pressable card;
 *   "code" is a code block or diagram (data-dil-copy-language, and
 *   data-dil-copy-source when the source is not the shown text); "chart" is a
 *   chart with a [data-dil-chart-title] and data registered in chart-copy.
 * - data-dil-copy-text replaces a subtree with that text.
 * Hidden elements, live regions, overlays, scripts, and controls' internals
 * are never read.
 */
const SKIPPED_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "TEMPLATE",
  "NOSCRIPT",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "CANVAS",
  "AUDIO",
  "VIDEO",
  "BUTTON",
  "DIALOG",
]);
const SKIPPED_ROLES = new Set([
  "alert",
  "status",
  "log",
  "timer",
  "tooltip",
  "dialog",
  "alertdialog",
  "menu",
  "menubar",
  "tablist",
  "tab",
  "toolbar",
  "progressbar",
  "button",
]);
const BLOCK_TAGS = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "UL",
  "OL",
  "LI",
  "BLOCKQUOTE",
  "PRE",
  "TABLE",
  "HR",
  "DIV",
  "SECTION",
  "ARTICLE",
  "ASIDE",
  "HEADER",
  "FOOTER",
  "NAV",
  "MAIN",
  "FIGURE",
  "FIGCAPTION",
  "DETAILS",
  "SUMMARY",
  "DL",
  "DT",
  "DD",
  "FORM",
  "FIELDSET",
  "ADDRESS",
]);
const MARKS: Record<string, "strong" | "emphasis" | "deleted"> = {
  STRONG: "strong",
  B: "strong",
  EM: "emphasis",
  I: "emphasis",
  DEL: "deleted",
  S: "deleted",
  STRIKE: "deleted",
};
const LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const IMAGE_PROTOCOLS = new Set(["http:", "https:"]);
const TEXT_INPUTS = new Set([
  "",
  "text",
  "search",
  "email",
  "url",
  "tel",
  "number",
  "date",
  "time",
  "datetime-local",
  "month",
  "week",
  "range",
  "color",
]);
const CONTROLS =
  'input, textarea, select, [role="checkbox"], [role="radio"], [role="switch"], [role="slider"]';
/** What an element shows: an open shadow root replaces its light children. */
function content(element: Element): Element | ShadowRoot {
  return element.shadowRoot ?? element;
}

function copyHint(element: Element) {
  return element.getAttribute("data-dil-copy");
}
/**
 * Progressive reveal makes a block inert only while it fades in (see
 * RevealController.prepare). That block is content the reader is about to
 * see, so a copy taken during the fade keeps it.
 */
function inertContent(element: Element) {
  if (!element.hasAttribute("inert")) return false;
  const phase = element.getAttribute("data-dil-phase");
  return phase !== "ready" && phase !== "revealing";
}
function hidden(element: Element): boolean {
  const hint = copyHint(element);
  if (hint === "include") return false;
  if (hint === "skip") return true;
  if (
    element.hasAttribute("hidden") ||
    inertContent(element) ||
    element.hasAttribute("data-dil-portals") ||
    element.getAttribute("aria-hidden") === "true" ||
    element.classList.contains("sr-only")
  )
    return true;
  const style = (element as HTMLElement).style as
    CSSStyleDeclaration | undefined;
  if (style?.display === "none" || style?.visibility === "hidden") return true;
  // Controls keep their state; other actions and widget chrome are internals.
  const role = element.getAttribute("role");
  if (
    hint === "content" ||
    controlKind(element) ||
    role === "slider" ||
    role === "combobox"
  )
    return false;
  return SKIPPED_TAGS.has(element.tagName) || SKIPPED_ROLES.has(role ?? "");
}
/** The URL, resolved against the page, when its scheme is allowed. */
function safeUrl(element: Element, attribute: string, allowed: Set<string>) {
  const value = element.getAttribute(attribute);
  if (!value) return null;
  try {
    const url = new URL(value, element.ownerDocument.baseURI);
    return allowed.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
function controlState(element: Element): boolean | null {
  if (element instanceof HTMLInputElement) return element.checked;
  const state =
    element.getAttribute("aria-checked") ??
    element.getAttribute("aria-pressed");
  return state === null ? null : state === "true";
}
function controlKind(element: Element): "check" | "radio" | null {
  const role = element.getAttribute("role");
  const type =
    element instanceof HTMLInputElement ? element.type.toLowerCase() : "";
  if (role === "radio" || type === "radio") return "radio";
  if (
    role === "checkbox" ||
    role === "switch" ||
    role === "menuitemcheckbox" ||
    type === "checkbox" ||
    (element.tagName === "BUTTON" && element.hasAttribute("aria-pressed"))
  )
    return "check";
  return null;
}
function lines(value: string): Inline[] {
  return value
    .split(/\r\n|\r|\n/)
    .flatMap((line, index): Inline[] =>
      index
        ? [{ kind: "break" }, { kind: "text", value: line }]
        : [{ kind: "text", value: line }],
    );
}
/** A form value, a control mark, or null when the element is not a form value. */
function formValue(element: Element): Inline[] | null {
  const kind = controlKind(element);
  if (kind) {
    const mark: Inline = {
      kind: "mark",
      control: kind,
      checked: controlState(element) === true,
    };
    // Options in a row stay apart. An input labels itself elsewhere; a
    // role-based control, such as a toggle option, may hold its label.
    const space: Inline = { kind: "text", value: " " };
    return element.tagName === "INPUT"
      ? [space, mark, space]
      : [space, mark, space, ...inlineChildren(element), space];
  }
  const role = element.getAttribute("role");
  if (role === "slider") {
    const value =
      element.getAttribute("aria-valuetext") ??
      element.getAttribute("aria-valuenow") ??
      "";
    const label = element.getAttribute("aria-label");
    return [{ kind: "text", value: label ? `${label}: ${value}` : value }];
  }
  if (role === "combobox" && element.tagName !== "INPUT")
    return [{ kind: "text", value: element.textContent ?? "" }];
  if (element instanceof HTMLInputElement)
    return TEXT_INPUTS.has(element.type.toLowerCase())
      ? [{ kind: "text", value: element.value }]
      : [];
  if (element instanceof HTMLTextAreaElement) return lines(element.value);
  if (element instanceof HTMLSelectElement)
    return [
      {
        kind: "text",
        value: [...element.selectedOptions]
          .map((option) => option.text)
          .join(", "),
      },
    ];
  return null;
}
function inlineChildren(element: Element): Inline[] {
  return [...content(element).childNodes].flatMap(inlineNode);
}
function inlineNode(node: Node): Inline[] {
  if (node.nodeType === 3)
    return [{ kind: "text", value: node.nodeValue ?? "" }];
  if (!(node instanceof Element) || hidden(node)) return [];
  const text = node.getAttribute("data-dil-copy-text");
  if (text !== null) return [{ kind: "text", value: text }];
  const value = formValue(node);
  if (value) return value;
  const mark = MARKS[node.tagName];
  if (mark) return [{ kind: mark, children: inlineChildren(node) }];
  switch (node.tagName) {
    case "CODE":
      return [{ kind: "code", value: node.textContent ?? "" }];
    case "BR":
      return [{ kind: "break" }];
    case "IMG": {
      const src = safeUrl(node, "src", IMAGE_PROTOCOLS);
      const alt = node.getAttribute("alt") ?? "";
      if (src) return [{ kind: "image", src, alt }];
      return alt ? [{ kind: "text", value: alt }] : [];
    }
    case "A": {
      const href = safeUrl(node, "href", LINK_PROTOCOLS);
      const children = inlineChildren(node);
      return href ? [{ kind: "link", href, children }] : children;
    }
    case "svg":
    case "SVG": {
      const label =
        node.getAttribute("role") === "img" && node.getAttribute("aria-label");
      return label ? [{ kind: "text", value: label }] : [];
    }
    default:
      return inlineChildren(node);
  }
}
// Per read: elements outlive renders, and whether one holds blocks changes
// with its content.
let blockCache = new WeakMap<Element, boolean>();
function isBlock(element: Element): boolean {
  if (hidden(element) || element.hasAttribute("data-dil-copy-text"))
    return false;
  if (formValue(element) !== null) return false;
  const cached = blockCache.get(element);
  if (cached !== undefined) return cached;
  const hint = copyHint(element);
  const block =
    BLOCK_TAGS.has(element.tagName) ||
    // A labeled control is a line of its own, as in a list of options.
    (element.tagName === "LABEL" && element.querySelector(CONTROLS) !== null) ||
    hint === "code" ||
    hint === "chart" ||
    (element.tagName !== "svg" && [...content(element).children].some(isBlock));
  blockCache.set(element, block);
  return block;
}
/** Merges adjacent text and collapses whitespace as HTML layout does. */
function normalize(children: Inline[], collapse = true): Inline[] {
  const merged: Inline[] = [];
  for (const child of children) {
    const previous = merged.at(-1);
    if (child.kind === "text" && previous?.kind === "text")
      previous.value += child.value;
    else if (child.kind === "text") merged.push({ ...child });
    else if ("children" in child)
      merged.push({ ...child, children: normalize(child.children, collapse) });
    else merged.push(child);
  }
  if (!collapse) return merged;
  for (const child of merged)
    if (child.kind === "text") child.value = child.value.replace(/\s+/g, " ");
  return merged;
}
function trim(children: Inline[]): Inline[] {
  const result = normalize(children);
  const first = result[0];
  if (first?.kind === "text") first.value = first.value.trimStart();
  const last = result.at(-1);
  if (last?.kind === "text") last.value = last.value.trimEnd();
  return result.filter((child) => child.kind !== "text" || child.value);
}
function meaningful(children: Inline[]) {
  return children.some((child) =>
    child.kind === "text" ? /\S/.test(child.value) : child.kind !== "break",
  );
}
function paragraph(children: Inline[]): Block[] {
  const content = trim(children);
  return meaningful(content) ? [{ kind: "paragraph", children: content }] : [];
}
/** Blocks flattened into one line of inline content, as in a table cell. */
function flatten(blocks: Block[]): Inline[] {
  return blocks.flatMap((block, index): Inline[] => {
    const separator: Inline[] = index ? [{ kind: "break" }] : [];
    switch (block.kind) {
      case "paragraph":
      case "heading":
        return [...separator, ...block.children];
      case "code":
        return [...separator, { kind: "code", value: block.value }];
      case "list":
        return [...separator, ...flatten(block.items.flat())];
      case "quote":
        return [...separator, ...flatten(block.children)];
      default:
        return separator;
    }
  });
}
function codeBlock(language: string, value: string): Block[] {
  const code = value.replace(/\n$/, "");
  return code ? [{ kind: "code", language, value: code }] : [];
}
function preLanguage(element: Element) {
  const code = element.querySelector("code");
  const name = [...(code?.classList ?? [])].find((item) =>
    item.startsWith("language-"),
  );
  return name?.slice("language-".length) ?? "";
}
function ownRows(table: Element) {
  return [...table.querySelectorAll("tr")].filter(
    (row) => row.closest("table") === table && !hidden(row),
  );
}
function readTable(table: Element): Block[] {
  let header: Inline[][] | null = null;
  const rows: Inline[][][] = [];
  for (const row of ownRows(table)) {
    const cells = [...row.children].filter(
      (cell) =>
        (cell.tagName === "TD" || cell.tagName === "TH") && !hidden(cell),
    );
    const content = cells.map((cell) => trim(flatten(readBlocks(cell))));
    const headed =
      row.parentElement?.tagName === "THEAD" ||
      (cells.length > 0 && cells.every((cell) => cell.tagName === "TH"));
    if (headed && header === null && rows.length === 0) header = content;
    else rows.push(content);
  }
  return header || rows.length ? [{ kind: "table", header, rows }] : [];
}
function readChart(element: Element): Block[] {
  const title =
    element.querySelector("[data-dil-chart-title]")?.textContent?.trim() ||
    element.getAttribute("aria-label") ||
    "";
  const description = element
    .querySelector("[data-dil-chart-description]")
    ?.textContent?.trim();
  const data = chartCopy(element);
  const text = (value: string): Inline[] => [{ kind: "text", value }];
  return [
    ...(title
      ? [
          {
            kind: "paragraph",
            children: [{ kind: "strong", children: text(title) }],
          } satisfies Block,
        ]
      : []),
    ...(description ? paragraph(text(description)) : []),
    ...(data
      ? [
          {
            kind: "table",
            header: data.columns.map(text),
            rows: data.rows.map((row) => row.map(text)),
          } satisfies Block,
        ]
      : []),
  ];
}
function heading(element: Element): Block[] {
  const level = Number(element.tagName.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6;
  const children = trim(inlineChildren(element));
  return children.length ? [{ kind: "heading", level, children }] : [];
}
function readElement(element: Element): Block[] {
  const hint = copyHint(element);
  if (hint === "chart") return readChart(element);
  if (hint === "code")
    return codeBlock(
      element.getAttribute("data-dil-copy-language") ?? "",
      element.getAttribute("data-dil-copy-source") ??
        element.querySelector("textarea")?.value ??
        element.querySelector("pre")?.textContent ??
        "",
    );
  switch (element.tagName) {
    case "H1":
    case "H2":
    case "H3":
    case "H4":
    case "H5":
    case "H6":
      return heading(element);
    case "UL":
    case "OL": {
      const items = [...element.children]
        .filter((item) => item.tagName === "LI" && !hidden(item))
        .map(readBlocks);
      const start = Number(element.getAttribute("start") ?? "1");
      return items.length
        ? [
            {
              kind: "list",
              ordered: element.tagName === "OL",
              start: Number.isInteger(start) ? start : 1,
              items,
            },
          ]
        : [];
    }
    case "BLOCKQUOTE": {
      const children = readBlocks(element);
      return children.length ? [{ kind: "quote", children }] : [];
    }
    case "PRE":
      return codeBlock(preLanguage(element), element.textContent ?? "");
    case "TABLE":
      return readTable(element);
    case "HR":
      return [{ kind: "rule" }];
    default:
      return readBlocks(element);
  }
}
/** The blocks a rendered document shows now. */
export function readDocument(root: Element): Block[] {
  blockCache = new WeakMap();
  return readBlocks(root);
}
/** The blocks of an element's children; runs of inline content become paragraphs. */
function readBlocks(element: Element): Block[] {
  const blocks: Block[] = [];
  let run: Inline[] = [];
  const flush = () => {
    blocks.push(...paragraph(run));
    run = [];
  };
  for (const child of content(element).childNodes) {
    if (child instanceof Element && isBlock(child)) {
      flush();
      blocks.push(...readElement(child));
    } else run.push(...inlineNode(child));
  }
  flush();
  return blocks;
}
