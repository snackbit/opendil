import type { Nodes } from "mdast";
import type { MdxJsxFlowElement, MdxJsxTextElement } from "mdast-util-mdx-jsx";
import type { VFile } from "vfile";

export type JsxElement = MdxJsxFlowElement | MdxJsxTextElement;

export function isJsxElement(node: Nodes): node is JsxElement {
  return node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement";
}

/** Literal value of an attribute: a string, or an array of strings written as an expression. */
export function attribute(
  node: JsxElement,
  name: string,
): string | string[] | undefined {
  for (const item of node.attributes) {
    if (item.type !== "mdxJsxAttribute" || item.name !== name) continue;
    if (item.value === null || item.value === undefined) return "";
    if (typeof item.value === "string") return item.value;
    const statement = item.value.data?.estree?.body[0];
    if (statement?.type !== "ExpressionStatement") return undefined;
    const { expression } = statement;
    if (expression.type === "Literal" && typeof expression.value === "string")
      return expression.value;
    if (expression.type !== "ArrayExpression") return undefined;
    const values = expression.elements.map((element) =>
      element?.type === "Literal" && typeof element.value === "string"
        ? element.value
        : undefined,
    );
    return values.every((value) => value !== undefined)
      ? (values as string[])
      : undefined;
  }
  return undefined;
}

/** A required string attribute; the build fails with the page location otherwise. */
export function stringAttribute(
  file: VFile,
  node: JsxElement,
  name: string,
): string {
  const value = attribute(node, name);
  if (typeof value === "string" && value) return value;
  return file.fail(
    `<${node.name}> needs a literal ${name}="…" attribute`,
    node,
  );
}

/** The direct JSX children with the given name, skipping whitespace. */
export function jsxChildren(node: JsxElement, name: string): JsxElement[] {
  return node.children.filter(
    (child): child is JsxElement =>
      isJsxElement(child as Nodes) && (child as JsxElement).name === name,
  );
}
