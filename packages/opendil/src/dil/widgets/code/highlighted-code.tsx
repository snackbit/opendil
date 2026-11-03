import { createElement, memo, useMemo, type ReactNode } from "react";
import { createLowlight, common } from "lowlight";
const highlighter = createLowlight(common);
const aliases: Record<string, string> = {
  ts: "typescript",
  js: "javascript",
  html: "xml",
  sh: "bash",
  py: "python",
  text: "plaintext",
  txt: "plaintext",
};
type Tree = ReturnType<typeof highlighter.highlight>;
export function renderTokens(
  node: Tree | Tree["children"][number],
  count: { value: number },
): ReactNode {
  if (++count.value > 2000) throw new Error("Highlighting span limit");
  if (node.type === "text") return node.value;
  if (node.type !== "element" && node.type !== "root") return null;
  const children = node.children.map((child) => renderTokens(child, count));
  return node.type === "root"
    ? children
    : createElement(
        "span",
        {
          key: count.value,
          className: Array.isArray(node.properties.className)
            ? node.properties.className.join(" ")
            : undefined,
        },
        children,
      );
}
/** Highlight AST nodes become React text/spans; authored code never becomes raw HTML. */
export const HighlightedCode = memo(function HighlightedCode({
  source,
  language,
}: {
  source: string;
  language: string;
}) {
  const content = useMemo(() => {
    const normalized = language.toLowerCase();
    const grammar = aliases[normalized] ?? normalized;
    if (source.length > 32768 || !highlighter.registered(grammar))
      return source;
    try {
      return renderTokens(highlighter.highlight(grammar, source), { value: 0 });
    } catch {
      return source;
    }
  }, [source, language]);
  return content;
});
