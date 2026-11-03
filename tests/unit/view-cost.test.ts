import { expect, it } from "vitest";
import { DilParser } from "../../packages/opendil/src/dil/parser/dil-parser";
import { ChildList } from "../../packages/opendil/src/dil/runtime/child-list";
import type { NodeState } from "../../packages/opendil/src/dil/runtime/document";
import {
  nodeCost,
  childrenCost,
  type CostDocument,
} from "../../packages/opendil/src/dil/runtime/view-cost";
function model(
  source: string,
  values = new Map<string, unknown>(),
  complete = true,
): CostDocument {
  const batch = new DilParser().append(source, complete);
  const nodes = new Map<number, NodeState>(
    batch.nodes.map((node) => [node.id, { node, children: new ChildList() }]),
  );
  for (const link of batch.links) {
    const parent = nodes.get(link.parent);
    if (parent) parent.children = parent.children.append([link.child]);
  }
  const read = (expression: string) => {
    if (!values.has(expression)) throw new Error("Waiting");
    return values.get(expression);
  };
  return {
    nodes,
    engine: { read },
    attributes: (node) =>
      Object.fromEntries(
        Object.entries(node.attributes).map(([key, attribute]) => [
          key,
          attribute.expression === undefined
            ? attribute.literal
            : read(attribute.expression),
        ]),
      ),
  };
}
it("short-circuits unknown, pending, whitespace, and oversized subtrees", () => {
  const doc = model("<box>Text</box>");
  expect(nodeCost(doc, 999, {}, false, 100)).toBe(1);
  expect(nodeCost(doc, 0, {}, false, 0)).toBe(1);
  expect(childrenCost(doc, [0], {}, false, 1)).toBeGreaterThan(1);
  const text = [...doc.nodes.values()].find(
    (state) => state.node.kind === "markdown",
  );
  if (!text) throw new Error("Missing text fixture");
  text.node = { ...text.node, text: "  " };
  expect(nodeCost(doc, text.node.id, {}, false, 100)).toBe(0);
  const pending = model("<Chart content={{", new Map(), false);
  const node = [...pending.nodes.values()].find(
    (state) => state.node.kind === "pending",
  );
  if (!node) throw new Error("Missing pending fixture");
  expect(nodeCost(pending, node.node.id, {}, false, 100)).toBe(1);
});
it("costs the selected conditional branch and waits for unknown conditions", () => {
  const values = new Map<string, unknown>([["show", true]]);
  const doc = model(
    "{#if show}<text>Yes</text>{:else}<text>No</text>{/if}",
    values,
  );
  const branch = [...doc.nodes.values()].find(
    (state) => state.node.kind === "if",
  );
  if (!branch) throw new Error("Missing conditional fixture");
  expect(nodeCost(doc, branch.node.id, {}, false, 100)).toBeGreaterThan(1);
  values.set("show", false);
  expect(nodeCost(doc, branch.node.id, {}, false, 100)).toBeGreaterThan(1);
  values.delete("show");
  expect(nodeCost(doc, branch.node.id, {}, false, 100)).toBe(1);
  const empty = model("{#if show}Yes{/if}", new Map([["show", false]]));
  const condition = [...empty.nodes.values()].find(
    (state) => state.node.kind === "if",
  );
  if (!condition) throw new Error("Missing empty conditional fixture");
  expect(nodeCost(empty, condition.node.id, {}, false, 100)).toBe(1);
});
it("bounds repeats before expansion and delegates virtualized collections", () => {
  const values = new Map<string, unknown>([["items", [1, 2]]]);
  const doc = model(
    "{#each items as item,i}<text>{item}</text>{/each}",
    values,
  );
  const each = [...doc.nodes.values()].find(
    (state) => state.node.kind === "each",
  );
  if (!each) throw new Error("Missing repeat fixture");
  expect(nodeCost(doc, each.node.id, {}, false, 100)).toBeGreaterThan(1);
  expect(nodeCost(doc, each.node.id, {}, true, 3)).toBeGreaterThan(3);
  values.set("items", 42);
  expect(nodeCost(doc, each.node.id, {}, false, 100)).toBe(1);
  values.delete("items");
  expect(nodeCost(doc, each.node.id, {}, false, 100)).toBe(1);
  values.set("items", Array(200).fill(1));
  expect(nodeCost(doc, each.node.id, {}, false, 100)).toBe(1);
  expect(nodeCost(doc, each.node.id, {}, true, 10)).toBeGreaterThan(10);
  const flow = model("<box>Row</box>".repeat(200));
  expect(nodeCost(flow, 0, {}, false, 2000)).toBe(1);
  expect(nodeCost(flow, 0, {}, true, 10)).toBeGreaterThan(10);
});
