"use client";
import { memo, useCallback, useContext, useMemo, useLayoutEffect } from "react";
import { useStore } from "zustand";
import type { DilDocument } from "../runtime/document";
import type { BindingState, Scope } from "../runtime/expressions";
import { MarkdownNode } from "./markdown-node";
import { NodeChildren } from "./node-children";
import { Primitive } from "../widgets/primitives/primitive";
import { RepeatedNodes } from "./repeated-nodes";
import { RenderBoundary } from "./render-boundary";
import { TableScope } from "./table-context";
import { LoadingBlock } from "./loading-block";
import { RenderLimit } from "./render-limit";
import { ControlRevisionContext } from "../widgets/control-revision";
import { usePresentationKey } from "./reveal/presentation";
import { ConditionalView } from "./conditional-view";

const EMPTY_SCOPE: Scope = Object.freeze({});
const INLINE = new Set([
  "text",
  "title",
  "caption",
  "badge",
  "button",
  "checkbox",
  "radio",
  "label",
]);
export interface NodeViewProps {
  id: number;
  document: DilDocument;
  scope?: Scope;
  inline?: boolean;
  svg?: boolean;
  instance?: string;
}
export const NodeView = memo(function NodeView(props: NodeViewProps) {
  return (
    <RenderLimit document={props.document}>
      <NodeContent {...props} />
    </RenderLimit>
  );
});
const NodeContent = memo(function NodeContent({
  id,
  document,
  scope = EMPTY_SCOPE,
  inline = false,
  svg = false,
  instance = "",
}: NodeViewProps) {
  const table = useContext(TableScope);
  const { node, children } = useStore(document.node(id));
  const presentationKey = usePresentationKey("node:" + id + ":" + instance);
  const expressions = useMemo(
    () => [
      ...node.expressions,
      ...Object.values(node.attributes).flatMap((attribute) =>
        attribute.expression === undefined ? [] : [attribute.expression],
      ),
      ...(node.kind === "if"
        ? children.toArray().flatMap((child) => {
            const condition = document.node(child).getState().node.attributes
              .condition?.expression;
            return condition === undefined ? [] : [condition];
          })
        : []),
    ],
    [node.expressions, node.attributes, node.kind, children, document],
  );
  const selectVersion = useCallback(
    (state: BindingState) => {
      return document.engine.signature(expressions, scope, state);
    },
    [document, expressions, scope],
  );
  useLayoutEffect(
    () => document.engine.retain(expressions, scope),
    [document, expressions, scope],
  );
  const version = useStore(document.engine.store, selectVersion);
  const evaluated = useMemo(() => {
    // The signature is the selective dependency on document-owned mutable state.
    void version;
    try {
      return { attributes: document.attributes(node, scope), error: "" };
    } catch (error) {
      return {
        attributes: {},
        error:
          error instanceof Error ? error.message : "Cannot evaluate component",
      };
    }
  }, [node, document, scope, version]);
  const complete = useStore(document.status, (state) => state.complete);
  const previous = document.presentation.last(presentationKey);
  useLayoutEffect(() => {
    if (!evaluated.error && node.kind !== "pending")
      document.presentation.remember(presentationKey, evaluated.attributes);
  }, [document, presentationKey, evaluated, node.kind]);
  const attributes =
    evaluated.error && previous ? previous : evaluated.attributes;

  if (node.status === "error")
    return (
      <LoadingBlock
        name={node.name}
        table={table}
        svg={svg}
        error={node.error}
      />
    );
  if (evaluated.error && !previous)
    return (
      <LoadingBlock
        name={node.name}
        table={table}
        svg={svg}
        error={
          complete &&
          !evaluated.error.startsWith("Waiting for isolated") &&
          !document.engine.stopped
            ? evaluated.error
            : undefined
        }
      />
    );
  if (node.kind === "pending")
    return <LoadingBlock name={node.name} table={table} svg={svg} />;
  if (node.kind === "markdown")
    return (
      <RenderBoundary
        revision={`${node.text.length}:${version}`}
        streaming={!complete}
      >
        <MarkdownNode
          node={node}
          document={document}
          scope={scope}
          inline={inline}
          svg={svg}
          instance={instance}
        />
      </RenderBoundary>
    );
  if (node.kind === "each")
    return (
      <RepeatedNodes
        node={node}
        childrenIds={children}
        document={document}
        scope={scope}
        svg={svg}
        instance={instance}
        attributes={attributes}
      />
    );
  if (node.kind === "if")
    return (
      <ConditionalView
        childrenIds={children}
        document={document}
        scope={scope}
        svg={svg}
        inline={inline}
        instance={instance}
      />
    );
  if (node.kind === "branch" || node.kind === "root")
    return (
      <NodeChildren
        childrenIds={children}
        document={document}
        scope={scope}
        svg={svg}
        inline={inline}
        instance={instance}
        flowParent={node.kind === "root" ? id : undefined}
      />
    );
  const svgChildren = svg || node.name === "svg";
  const childContent = (
    <NodeChildren
      childrenIds={children}
      document={document}
      scope={scope}
      svg={svgChildren}
      inline={INLINE.has(node.name)}
      instance={instance}
      flowParent={node.name === "box" ? id : undefined}
    />
  );
  return (
    <RenderBoundary
      revision={`${node.status}:${version}`}
      streaming={!complete}
    >
      <ControlRevisionContext.Provider
        value={document.engine.evaluationRevision(
          node.attributes.value?.expression ??
            node.attributes.checked?.expression,
          scope,
        )}
      >
        <Primitive
          node={node}
          attributes={attributes}
          document={document}
          scope={scope}
          instance={instance}
          svg={svg}
          inline={inline}
          interactive={
            !evaluated.error ||
            expressions.every((source) =>
              document.engine.hasValue(source, scope),
            )
          }
        >
          {childContent}
        </Primitive>
      </ControlRevisionContext.Provider>
    </RenderBoundary>
  );
});
