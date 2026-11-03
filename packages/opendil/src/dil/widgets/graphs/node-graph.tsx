"use client";
import { useCallback, useMemo } from "react";
import { ReactFlow, Background, Controls } from "@xyflow/react";
import { invoke, type Attributes } from "../primitives/attribute-values";
import { graphModel } from "./graph-model";
import { ServiceNode } from "./service-node";
const nodeTypes = { service: ServiceNode };
export interface NodeGraphProps {
  attributes: Attributes;
  presentationRef?: ((element: HTMLElement | null) => void) | undefined;
}
export function NodeGraph({ attributes, presentationRef }: NodeGraphProps) {
  const model = useMemo(
    () => graphModel(attributes.content),
    [attributes.content],
  );
  const nodes = useMemo(
    () =>
      model.nodes.map((node) => ({
        ...node,
        selected: attributes.selectedId === node.id,
      })),
    [model.nodes, attributes.selectedId],
  );
  const select = useCallback(
    (_event: unknown, node: { id: string }) =>
      invoke(attributes, "onSelect", node.id),
    [attributes],
  );
  return (
    <div
      ref={presentationRef}
      style={{ height: 320 }}
      aria-label="Interactive node graph"
    >
      <ReactFlow
        nodes={nodes}
        edges={model.edges}
        nodeTypes={nodeTypes}
        onNodeClick={select}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.25}
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
