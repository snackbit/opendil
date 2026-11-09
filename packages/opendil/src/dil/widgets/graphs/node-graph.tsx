"use client";
import {
  useCallback,
  useMemo,
  useState,
  type FocusEvent,
  type PointerEvent,
} from "react";
import { ReactFlow, Background, Controls, useKeyPress } from "@xyflow/react";
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
  // The wheel scrolls the page past the graph. It zooms the graph only while
  // the graph has focus or the zoom key is held (Cmd on macOS, Ctrl
  // elsewhere); pinch, the controls, and dragging work regardless.
  const [focused, setFocused] = useState(false);
  const commandHeld = useKeyPress("Meta", { preventDefault: false });
  const focus = useCallback(() => setFocused(true), []);
  // Panning cancels the pointer's default, which would otherwise focus the graph.
  const press = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.matches(":focus-within"))
      event.currentTarget.focus({ preventScroll: true });
  }, []);
  const blur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
  }, []);
  const wheelZooms = focused || commandHeld;
  return (
    <div
      ref={presentationRef}
      style={{ height: 320 }}
      role="group"
      aria-label="Interactive node graph"
      data-dil-copy="skip"
      data-wheel-zoom={wheelZooms}
      tabIndex={0}
      onFocus={focus}
      onBlur={blur}
      onPointerDownCapture={press}
      className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
        zoomOnScroll={focused}
        preventScrolling={wheelZooms}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
