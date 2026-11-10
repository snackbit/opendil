import { MarkerType, type Edge, type Node } from "@xyflow/react";
import { number, record, text } from "../primitives/attribute-values";
export const SERVICE_WIDTH = 160;
export const SERVICE_HEIGHT = 72;
export const COLUMN_GAP = 64;
export type ServiceData = { label: string; sub: string };
export type ServiceGraphNode = Node<ServiceData, "service">;
function coordinate(value: unknown, fallback: number) {
  const result = number(value, fallback);
  return Number.isFinite(result) ? result : fallback;
}
export function graphModel(content: unknown): {
  nodes: ServiceGraphNode[];
  edges: Edge[];
} {
  const data = record(content);
  const entries = (Array.isArray(data.nodes) ? data.nodes : [])
    .slice(0, 200)
    .map(record);
  const positioned = entries.map((node, index) => ({
    node,
    index,
    x: coordinate(node.x, (index % 3) * (SERVICE_WIDTH + COLUMN_GAP)),
    y: coordinate(node.y, Math.floor(index / 3) * (SERVICE_HEIGHT + 32)),
  }));
  const columns = [...new Set(positioned.map((position) => position.x))].sort(
    (a, b) => a - b,
  );
  const origin = columns[0] ?? 0;
  const nodes: ServiceGraphNode[] = positioned.map(({ node, index, x, y }) => {
    const shifted = columns
      .filter((column) => column <= x)
      .reduce(
        (previous, column) =>
          Math.max(column, previous + SERVICE_WIDTH + COLUMN_GAP),
        -Infinity,
      );
    return {
      id: text(node.id, String(index)),
      type: "service",
      position: { x: shifted - origin, y },
      data: { label: text(node.label), sub: text(node.sub) },
      width: SERVICE_WIDTH,
      height: SERVICE_HEIGHT,
    };
  });
  for (const x of new Set(nodes.map((node) => node.position.x))) {
    const column = nodes
      .filter((node) => node.position.x === x)
      .sort((a, b) => a.position.y - b.position.y);
    let bottom = -Infinity;
    for (const node of column) {
      node.position.y = Math.max(node.position.y, bottom + 32);
      bottom = node.position.y + SERVICE_HEIGHT;
    }
  }
  const ids = new Set(nodes.map((node) => node.id));
  const edges: Edge[] = (Array.isArray(data.edges) ? data.edges : [])
    .slice(0, 400)
    .map(record)
    .filter((edge) => ids.has(text(edge.source)) && ids.has(text(edge.target)))
    .map((edge, index) => ({
      id: text(edge.id, String(index)),
      source: text(edge.source),
      target: text(edge.target),
      sourceHandle: "out",
      targetHandle: "in",
      label: text(edge.label),
      // Right angles: a curve between distant nodes sweeps across the ones
      // between them.
      type: "step",
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { strokeWidth: 1.5 },
    }));
  return { nodes, edges };
}
