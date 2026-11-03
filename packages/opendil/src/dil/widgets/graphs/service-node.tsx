import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ServiceGraphNode } from "./graph-model";
export function ServiceNode({ data, selected }: NodeProps<ServiceGraphNode>) {
  return (
    <div className="dil-service-node" data-selected={selected}>
      <Handle type="target" position={Position.Left} id="in" />
      <strong>{data.label}</strong>
      {data.sub && <span>{data.sub}</span>}
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}
