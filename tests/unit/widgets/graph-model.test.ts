import { expect, it } from "vitest";
import {
  graphModel,
  SERVICE_WIDTH,
  COLUMN_GAP,
} from "../../../packages/opendil/src/dil/widgets/graphs/graph-model";
it("preserves subtitles and reserves connector clearance between columns", () => {
  const graph = graphModel({
    nodes: [
      { id: "a", label: "Gateway", sub: "Ingress", x: 18, y: 105 },
      { id: "b", label: "API", sub: "Compute", x: 182, y: 40 },
      { id: "c", label: "Worker", sub: "Jobs", x: 182, y: 50 },
    ],
    edges: [
      { source: "a", target: "b" },
      { source: "missing", target: "a" },
    ],
  });
  expect(graph.nodes[0]?.data.sub).toBe("Ingress");
  expect(
    (graph.nodes[1]?.position.x ?? 0) - (graph.nodes[0]?.position.x ?? 0),
  ).toBeGreaterThanOrEqual(SERVICE_WIDTH + COLUMN_GAP);
  expect(
    (graph.nodes[2]?.position.y ?? 0) - (graph.nodes[1]?.position.y ?? 0),
  ).toBeGreaterThanOrEqual(104);
  expect(graph.edges).toHaveLength(1);
});
it("handles absent, malformed, oversized, and widely spaced graph input", () => {
  expect(graphModel(null)).toEqual({ nodes: [], edges: [] });
  expect(graphModel({ nodes: false, edges: false })).toEqual({
    nodes: [],
    edges: [],
  });
  const graph = graphModel({
    nodes: [null, { x: NaN }, { id: "z", x: 10000, y: Infinity }],
    edges: [null],
  });
  expect(graph.nodes[0]?.id).toBe("0");
  expect(graph.nodes[2]?.position.x).toBe(10000);
  expect(graph.nodes[2]?.data.sub).toBe("");
  expect(
    graphModel({
      nodes: Array.from({ length: 201 }, (_, index) => ({ id: String(index) })),
      edges: Array.from({ length: 401 }, () => ({ source: "0", target: "1" })),
    }).nodes,
  ).toHaveLength(200);
});
