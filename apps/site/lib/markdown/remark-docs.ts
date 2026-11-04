import type { Nodes, Parent, Root, RootContent } from "mdast";
import { replaceSource } from "fumadocs-core/mdx-plugins/stringifier";
import type { VFile } from "vfile";
import { cleanMarkdown } from "./clean-markdown";
import { isJsxElement, type JsxElement } from "./jsx";
import {
  expandComponentProps,
  expandSpecDocument,
  expandSpecExcerpt,
} from "./spec-content";

const expansions: Record<
  string,
  (file: VFile, node: JsxElement) => RootContent[]
> = {
  ComponentProps: expandComponentProps,
  SpecExcerpt: expandSpecExcerpt,
  SpecDocument: expandSpecDocument,
};

interface Expansion {
  node: JsxElement;
  parent: Parent;
}

/**
 * The docs MDX contract at build time. <ComponentProps>, <SpecExcerpt> and
 * <SpecDocument> are replaced by Markdown generated from the spec; every other
 * JSX element gets a plain Markdown form for the .md output, so it holds no JSX.
 * Runs before remark-heading so generated headings get IDs and TOC entries.
 */
export function remarkDocs() {
  return (tree: Root, file: VFile) => {
    const pending: Expansion[] = [];
    let depth = 2;
    const visit = (node: Nodes, parent?: Parent) => {
      if (node.type === "heading") depth = node.depth;
      if (
        node.type === "mdxFlowExpression" ||
        node.type === "mdxTextExpression"
      )
        replaceSource(file, node, "");
      if (isJsxElement(node)) {
        if (node.name && node.name in expansions) {
          if (node.type !== "mdxJsxFlowElement" || !parent)
            file.fail(`<${node.name}> must stand on its own line`, node);
          pending.push({ node, parent: parent! });
          return;
        }
        cleanMarkdown(file, node, Math.min(depth + 1, 6));
      }
      if ("children" in node)
        for (const child of node.children) visit(child as Nodes, node);
    };
    visit(tree);
    // Later siblings first, so earlier indices stay valid while splicing.
    for (const { node, parent } of pending.reverse()) {
      const index = parent.children.indexOf(node as RootContent);
      const content = expansions[node.name!]!(file, node);
      parent.children.splice(index, 1, ...(content as typeof parent.children));
    }
  };
}
