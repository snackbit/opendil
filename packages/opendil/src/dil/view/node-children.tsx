"use client";
import type { DilDocument } from "../runtime/document";
import type { Scope } from "../runtime/expressions";
import type { ChildList } from "../runtime/child-list";
import { NodeView } from "./node-view";
import { VirtualFlow } from "./virtual-flow";
import { useContext } from "react";
import { useStore } from "zustand";
import { RenderAllowance, RenderExceeded } from "./render-limit";
import { childrenCost } from "../runtime/view-cost";

export interface NodeChildrenProps {
  childrenIds: ChildList;
  document: DilDocument;
  scope: Scope;
  inline: boolean;
  svg: boolean;
  instance: string;
  flowParent?: number | undefined;
}
function DocumentFlow({
  parent,
  document,
  scope,
  instance,
}: {
  parent: number;
  document: DilDocument;
  scope: Scope;
  instance: string;
}) {
  const children = useStore(document.flowChildren(parent));
  return (
    <VirtualFlow
      count={children.length}
      childIds={children}
      document={document}
      scope={scope}
      instance={instance}
    />
  );
}
export function NodeChildren({
  childrenIds,
  document,
  scope,
  inline,
  svg,
  instance,
  flowParent,
}: NodeChildrenProps) {
  const allowance = useContext(RenderAllowance);
  if (flowParent !== undefined && !svg) {
    return (
      <DocumentFlow
        parent={flowParent}
        document={document}
        scope={scope}
        instance={instance}
      />
    );
  }
  if (
    childrenCost(document, childrenIds.toArray(), scope, svg, allowance) >
    allowance
  )
    return <RenderExceeded document={document} />;
  return childrenIds
    .toArray()
    .map((id) => (
      <NodeView
        key={id}
        id={id}
        document={document}
        scope={scope}
        inline={inline}
        svg={svg}
        instance={instance}
      />
    ));
}
