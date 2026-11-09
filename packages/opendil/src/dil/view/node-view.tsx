"use client";
import { memo, useCallback, useContext, useMemo, useLayoutEffect } from "react";
import { useStore } from "zustand";
import type { DilDocument } from "../runtime/document";
import type { BindingState, Scope } from "../runtime/expressions";
import { MarkdownNode } from "../markdown/markdown-node";
import { NodeChildren } from "./node-children";
import { Primitive } from "../widgets/primitives/primitive";
import { RepeatedNodes } from "./repeated-nodes";
import { RenderBoundary, useReportProblem } from "./render-boundary";
import { UNSHOWN_PART_MESSAGE, type DilRenderError } from "../render-error";
import { TableScope } from "./table-context";
import { LoadingBlock, NodePlaceholder } from "./loading-block";
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
    // Read with the values it belongs to, so a control sees one revision per batch.
    const revision = document.engine.evaluationRevision(
      node.attributes.value?.expression ?? node.attributes.checked?.expression,
      scope,
    );
    try {
      return {
        attributes: document.attributes(node, scope),
        error: "",
        revision,
      };
    } catch (error) {
      return {
        attributes: {},
        error:
          error instanceof Error ? error.message : "Cannot evaluate component",
        revision,
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
  // A halted runtime has reported its own reason.
  const failed =
    !!evaluated.error &&
    !previous &&
    !evaluated.error.startsWith("Waiting for isolated") &&
    !document.engine.stopped;
  const attributeProblem: DilRenderError | undefined = failed
    ? {
        kind: "runtime",
        code: "attributes-failed",
        message: `Cannot evaluate the attributes of <${node.name}>: ${evaluated.error}`,
        offset: node.offset,
      }
    : undefined;
  useReportProblem(document, attributeProblem);
  const reportRenderError = useCallback(
    (message: string) =>
      document.report({
        kind: "runtime",
        code: "component-render-failed",
        message: `Cannot render <${node.name}>: ${message}`,
        offset: node.offset,
      }),
    [document, node.name, node.offset],
  );

  // The host receives the parser's reason through onError and the console.
  if (node.status === "error")
    return (
      <LoadingBlock
        name={node.name}
        table={table}
        svg={svg}
        error={UNSHOWN_PART_MESSAGE}
        problem={{
          kind: "syntax",
          code: "malformed-syntax",
          message: node.error,
          offset: node.offset,
        }}
      />
    );
  if (evaluated.error && !previous)
    return (
      <NodePlaceholder
        document={document}
        nodeId={node.id}
        name={node.name}
        table={table}
        svg={svg}
        error={complete && failed ? UNSHOWN_PART_MESSAGE : undefined}
        problem={attributeProblem}
      />
    );
  if (node.kind === "pending")
    return (
      <NodePlaceholder
        document={document}
        nodeId={node.id}
        name={node.name}
        table={table}
        svg={svg}
      />
    );
  if (node.kind === "markdown")
    return (
      <RenderBoundary
        revision={`${node.text.length}:${version}`}
        streaming={!complete}
        onError={reportRenderError}
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
      onError={reportRenderError}
    >
      <ControlRevisionContext.Provider value={evaluated.revision}>
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
