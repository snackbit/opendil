import type { Nodes, Parent, RootContent } from "mdast";
import { remarkGfm } from "fumadocs-core/mdx-plugins/remark-gfm";
import { remark } from "remark";

const parser = remark().use(remarkGfm);
const flowParents = new Set(["root", "blockquote", "listItem"]);

/**
 * Plain Markdown (not MDX) as mdast, positions relative to `text`. The spec is
 * Markdown: braces and angle brackets in its prose are literal. MDX drops raw
 * HTML, so HTML nodes become visible text instead.
 */
export function parseMarkdown(text: string): RootContent[] {
  const tree = parser.parse(text);
  literalHtml(tree);
  return tree.children;
}

function literalHtml(parent: Parent) {
  parent.children = parent.children.map((child: Nodes) => {
    if ("children" in child) literalHtml(child);
    if (child.type !== "html") return child;
    const text = {
      type: "text" as const,
      value: child.value,
      position: child.position,
    };
    return flowParents.has(parent.type)
      ? {
          type: "paragraph" as const,
          children: [text],
          position: child.position,
        }
      : text;
  }) as typeof parent.children;
}
