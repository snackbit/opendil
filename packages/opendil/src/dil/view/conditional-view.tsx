import { useState, useLayoutEffect, useContext } from "react";
import { TableScope } from "./table-context";
import { LoadingBlock } from "./loading-block";
import type { ChildList } from "../runtime/child-list";
import type { DilDocument } from "../runtime/document";
import type { Scope } from "../runtime/expressions";
import { NodeView } from "./node-view";
import { BranchPresentation } from "./reveal/presentation";
export interface ConditionalViewProps {
  childrenIds: ChildList;
  document: DilDocument;
  scope: Scope;
  svg: boolean;
  inline: boolean;
  instance: string;
}
export function ConditionalView({
  childrenIds,
  document,
  scope,
  svg,
  inline,
  instance,
}: ConditionalViewProps) {
  const [previous, setPrevious] = useState<number | undefined>(undefined);
  const table = useContext(TableScope);
  const ids = childrenIds.toArray();
  const expressions = ids.flatMap((id) => {
    const source =
      document.nodes.get(id)?.node.attributes.condition?.expression;
    return source === undefined ? [] : [source];
  });
  const fresh = expressions.every((source) =>
    document.engine.isFresh(source, scope),
  );
  let selected = previous,
    error = false;
  if (fresh) {
    try {
      selected = ids.find((id) => {
        const source =
          document.nodes.get(id)?.node.attributes.condition?.expression;
        return source === undefined || !!document.engine.read(source, scope);
      });
    } catch {
      error = true;
    }
  }
  useLayoutEffect(() => {
    if (fresh && !error) setPrevious(selected);
  }, [fresh, error, selected]);
  if (selected !== undefined)
    return (
      <BranchPresentation key={selected}>
        <NodeView
          id={selected}
          document={document}
          scope={scope}
          svg={svg}
          inline={inline}
          instance={instance}
        />
      </BranchPresentation>
    );
  return fresh && !error ? null : (
    <LoadingBlock
      table={table}
      svg={svg}
      error={error ? "Could not update this view." : undefined}
    />
  );
}
