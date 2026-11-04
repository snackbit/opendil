"use client";
import { useCallback, useContext, useMemo } from "react";
import type { DilNode } from "../parser/types";
import type { ChildList } from "../runtime/child-list";
import type { DilDocument } from "../runtime/document";
import type { Scope } from "../runtime/expressions";
import { NodeChildren } from "./node-children";
import { VirtualFlow } from "./virtual-flow";
import { RenderAllowance, RenderExceeded } from "./render-limit";
import { nodeCost } from "../runtime/view-cost";

interface RepeatedNodesProps {
  node: DilNode;
  childrenIds: ChildList;
  document: DilDocument;
  scope: Scope;
  svg: boolean;
  instance: string;
  attributes: Record<string, unknown>;
}
interface ItemProps extends Omit<RepeatedNodesProps, "attributes"> {
  item: unknown;
  index: number;
}
function RepeatedItem({
  node,
  item,
  index,
  childrenIds,
  document,
  scope,
  svg,
  instance,
}: ItemProps) {
  const nested = useMemo(
    () => ({
      ...scope,
      [String(node.attributes.item?.literal)]: item,
      ...(node.attributes.index?.literal
        ? { [String(node.attributes.index.literal)]: index }
        : {}),
    }),
    [scope, node.attributes, item, index],
  );
  return (
    <NodeChildren
      childrenIds={childrenIds}
      document={document}
      scope={nested}
      svg={svg}
      inline={false}
      instance={`${instance}/${node.id}:${JSON.stringify(item && typeof item === "object" && "id" in item ? item.id : index)}`}
    />
  );
}
export function RepeatedNodes(props: RepeatedNodesProps) {
  const allowance = useContext(RenderAllowance);
  const { attributes, node, childrenIds, document, scope, svg, instance } =
    props;
  const items = useMemo(
    () => (Array.isArray(attributes.items) ? attributes.items : []),
    [attributes.items],
  );
  const getKey = useCallback(
    (index: number) => {
      const item: unknown = items[index];
      if (
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        (typeof item.id === "string" || typeof item.id === "number")
      )
        return item.id;
      return index;
    },
    [items],
  );
  const renderItem = useCallback(
    (index: number) => (
      <RepeatedItem
        node={node}
        item={items[index]}
        index={index}
        childrenIds={childrenIds}
        document={document}
        scope={scope}
        svg={svg}
        instance={instance}
      />
    ),
    [node, items, childrenIds, document, scope, svg, instance],
  );
  if (document.renderLimited) return null;
  if (svg && items.length > 1000) return <RenderExceeded document={document} />;
  // A repeat expands a complete template, never thousands of partial shells.
  if (node.status === "streaming" || node.status === "incomplete") return null;
  if (items.length > 100 && !svg)
    return (
      <VirtualFlow
        identity={"repeat:" + node.id + ":" + instance}
        count={items.length}
        document={document}
        scope={scope}
        instance={instance}
        renderItem={renderItem}
        itemKey={getKey}
      />
    );
  if (nodeCost(document, node.id, scope, svg, allowance) > allowance)
    return <RenderExceeded document={document} />;
  return items.map((item: unknown, index: number) => (
    <RenderAllowance.Provider
      key={getKey(index)}
      value={Math.floor(Math.max(0, allowance - 1) / Math.max(1, items.length))}
    >
      <RepeatedItem
        node={node}
        item={item}
        index={index}
        childrenIds={childrenIds}
        document={document}
        scope={scope}
        svg={svg}
        instance={instance}
      />
    </RenderAllowance.Provider>
  ));
}
