import type { DilDocument } from "./document";
import type { Scope } from "./expressions";
export interface CostDocument {
  nodes: DilDocument["nodes"];
  engine: Pick<DilDocument["engine"], "read">;
  attributes: DilDocument["attributes"];
}
/** Pure, short-circuiting preflight; unresolved expressions cost a local placeholder. */
export function nodeCost(
  document: CostDocument,
  id: number,
  scope: Scope,
  svg: boolean,
  limit: number,
): number {
  if (limit < 1) return 1;
  const state = document.nodes.get(id);
  if (!state) return 1;
  const { node, children } = state;
  if (node.kind === "markdown")
    return node.text.trim() ? 1 + Math.ceil(node.text.length / 64) : 0;
  if (node.kind === "pending") return 1;
  if (node.kind === "if") {
    for (const child of children.toArray()) {
      const branch = document.nodes.get(child)?.node;
      const expression = branch?.attributes.condition?.expression;
      try {
        if (expression === undefined || document.engine.read(expression, scope))
          return 1 + nodeCost(document, child, scope, svg, limit - 1);
      } catch {
        return 1;
      }
    }
    return 1;
  }
  if (node.kind === "each") {
    let items: unknown;
    try {
      items = document.attributes(node, scope).items;
    } catch {
      return 1;
    }
    if (!Array.isArray(items) || (items.length > 100 && !svg)) return 1;
    let total = 1;
    for (const [index, item] of items.entries()) {
      const nested = {
        ...scope,
        [String(node.attributes.item?.literal)]: item,
        ...(node.attributes.index?.literal
          ? { [String(node.attributes.index.literal)]: index }
          : {}),
      };
      total += childrenCost(
        document,
        children.toArray(),
        nested,
        svg,
        limit - total,
      );
      if (total > limit) break;
    }
    return total;
  }
  if (
    (node.kind === "root" || node.name === "box") &&
    children.length > 100 &&
    !svg
  )
    return 1;
  return (
    1 +
    childrenCost(
      document,
      children.toArray(),
      scope,
      svg || node.name === "svg",
      limit - 1,
    )
  );
}
export function childrenCost(
  document: CostDocument,
  ids: readonly number[],
  scope: Scope,
  svg: boolean,
  limit: number,
): number {
  let total = 0;
  for (const id of ids) {
    total += nodeCost(document, id, scope, svg, limit - total);
    if (total > limit) break;
  }
  return total;
}
