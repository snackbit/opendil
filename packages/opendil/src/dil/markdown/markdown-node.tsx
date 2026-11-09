"use client";
import {
  Children,
  cloneElement,
  createElement,
  isValidElement,
  createContext,
  useContext,
  useState,
  useLayoutEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import { useStore } from "zustand";
import { RenderLimit } from "../view/render-limit";
import { useReportProblem } from "../view/render-boundary";
import { PartProblem } from "../view/problem-view";
import { EvaluationPending, type Scope } from "../runtime/expressions";
import { useCustomization } from "../customization";
import type { DilRenderError } from "../render-error";
import {
  currentMarkdown,
  markdownIndent,
  normalizeMarkdown,
} from "./markdown-stream";
import {
  MarkdownBlock,
  MarkdownScopeContext,
  useMarkdownSnapshot,
  type MarkdownScope,
} from "./markdown-blocks";
import { decodeLiteralMarkdown } from "./literal-markdown";
import type { DilMarkdownComponents } from "./markdown-components";
import type { DilNode } from "../parser/types";
import type { DilDocument } from "../runtime/document";

const NO_COMPONENTS: DilMarkdownComponents = Object.freeze({});
/** Per-block and per-node cap on displayed Markdown text. */
const MAX_DISPLAYED_TEXT = 65536;
interface ExpressionContextValue {
  /** Source position of the Markdown node, for problem reports. */
  offset: number;
  expressions: readonly string[];
  document: DilDocument;
  scope: Scope;
}
const ExpressionContext = createContext<ExpressionContextValue | null>(null);
function useExpressions() {
  const value = useContext(ExpressionContext);
  if (!value) throw new Error("Missing Markdown scope");
  return value;
}
function ExpressionText({ index, token }: { index: number; token: string }) {
  const { expressions, document, scope, offset } = useExpressions();
  const source = expressions[index];
  const select = useCallback(
    (state: Parameters<typeof document.engine.signature>[2]) =>
      document.engine.signature(
        source === undefined ? [] : [source],
        scope,
        state,
      ),
    [document, source, scope],
  );
  useStore(document.engine.store, select);
  let text: string | number | undefined;
  let failure: string | undefined;
  if (source !== undefined)
    try {
      const value = document.engine.read(source, scope);
      text =
        typeof value === "string" || typeof value === "number"
          ? value
          : value && typeof value === "object"
            ? "[object Object]"
            : String(value ?? "");
    } catch (error) {
      if (!(error instanceof EvaluationPending))
        failure = error instanceof Error ? error.message : String(error);
    }
  const problem: DilRenderError | undefined =
    failure === undefined || source === undefined
      ? undefined
      : {
          kind: "runtime",
          code: "expression-failed",
          message: `Cannot evaluate {${source.length > 200 ? source.slice(0, 200) + "…" : source}}: ${failure}`,
          offset,
        };
  useReportProblem(document, problem);
  if (source === undefined) return token;
  if (problem)
    return (
      <PartProblem error={problem} inline>
        Cannot evaluate this value.
      </PartProblem>
    );
  if (text === undefined) return <span aria-busy="true" />;
  return (
    <RenderLimit document={document} cost={Math.ceil(String(text).length / 64)}>
      <span>{text}</span>
    </RenderLimit>
  );
}
function expressionChildren(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string")
      return child.split(/(DILX\d+END)/g).map((part, key) => {
        const match = /^DILX(\d+)END$/.exec(part);
        return match ? (
          <ExpressionText key={key} index={Number(match[1])} token={part} />
        ) : (
          part
        );
      });
    if (isValidElement<{ children?: ReactNode }>(child))
      return cloneElement(child, {}, expressionChildren(child.props.children));
    return child;
  });
}
const literalChildren = (children: ReactNode) => children;
function DisplayLimit({
  document,
  offset,
}: {
  document: DilDocument;
  offset: number;
}) {
  const problem: DilRenderError = {
    kind: "limit",
    code: "display-limit",
    message: `A Markdown block exceeds the display limit of ${MAX_DISPLAYED_TEXT} characters.`,
    offset,
  };
  useReportProblem(document, problem);
  return (
    <PartProblem error={problem}>
      Text block exceeds the display limit.
    </PartProblem>
  );
}
export interface MarkdownNodeProps {
  node: DilNode;
  document: DilDocument;
  scope: Scope;
  inline: boolean;
  svg: boolean;
  instance: string;
}
/** Markdown prose of a DIL document, with its expressions. */
export function MarkdownNode({
  node,
  document,
  scope,
  inline,
  svg,
  instance,
}: MarkdownNodeProps) {
  // Fixed once known, so a streaming node's indentation does not change as
  // it grows. Text that has it at mount needs no layout-time update.
  const [indent, setIndent] = useState(() => markdownIndent(node.text));
  const indentation = indent ?? markdownIndent(node.text);
  const oversized = node.text.length > MAX_DISPLAYED_TEXT;
  const source = oversized
    ? ""
    : normalizeMarkdown(node.text, indentation ?? 0);
  const snapshot = useMarkdownSnapshot(
    source,
    node.status !== "streaming",
    svg,
  );
  useLayoutEffect(() => {
    if (indent === undefined && indentation !== undefined)
      setIndent(indentation);
  }, [indent, indentation]);
  const { markdownComponents } = useCustomization();
  const markdown = useMemo<MarkdownScope>(
    () => ({
      components: markdownComponents ?? NO_COMPONENTS,
      substitute: expressionChildren,
      expressions: true,
      presentation: node.id + ":" + instance,
      origin: node.offset,
      inline,
    }),
    [markdownComponents, node.id, node.offset, instance, inline],
  );
  const context = useMemo(
    () => ({
      offset: node.offset,
      expressions: node.expressions,
      document,
      scope,
    }),
    [node.offset, node.expressions, document, scope],
  );
  if (!node.text.trim()) return null;
  if (oversized)
    return <DisplayLimit document={document} offset={node.offset} />;
  if (svg) {
    const rendered = node.text.replace(
      /DILX(\d+)END/g,
      (_match, index: string) => {
        const expression = node.expressions[Number(index)];
        return expression === undefined
          ? ""
          : String(document.engine.read(expression, scope));
      },
    );
    return (
      <RenderLimit document={document} cost={Math.ceil(rendered.length / 64)}>
        {rendered}
      </RenderLimit>
    );
  }
  return (
    <ExpressionContext.Provider value={context}>
      <MarkdownScopeContext.Provider value={markdown}>
        <RenderLimit document={document} cost={Math.ceil(source.length / 64)}>
          {createElement(
            inline ? "span" : "div",
            { className: "dil-markdown" + (inline ? " dil-inline" : "") },
            currentMarkdown(snapshot).map((block) => (
              <MarkdownBlock
                key={block.offset}
                offset={block.offset}
                text={block.text}
                streaming={
                  node.status === "streaming" && block.offset >= snapshot.offset
                }
              />
            )),
          )}
        </RenderLimit>
      </MarkdownScopeContext.Provider>
    </ExpressionContext.Provider>
  );
}
export interface LiteralMarkdownNodeProps {
  node: DilNode;
  document: DilDocument;
  instance: string;
}
/**
 * The raw body of a `<Markdown>` block: Markdown only, with no expressions,
 * tags, or directives. The display cap and render cost apply per block, so a
 * long body is not refused as a whole.
 */
export function LiteralMarkdownNode({
  node,
  document,
  instance,
}: LiteralMarkdownNodeProps) {
  const streaming = node.status === "streaming";
  const snapshot = useMarkdownSnapshot(
    decodeLiteralMarkdown(node.text),
    !streaming,
  );
  const { markdownComponents } = useCustomization();
  const markdown = useMemo<MarkdownScope>(
    () => ({
      components: markdownComponents ?? NO_COMPONENTS,
      substitute: literalChildren,
      expressions: false,
      presentation: "literal:" + node.id + ":" + instance,
      origin: node.offset,
      inline: false,
    }),
    [markdownComponents, node.id, node.offset, instance],
  );
  return (
    <MarkdownScopeContext.Provider value={markdown}>
      <div className="dil-markdown" data-d-component="Markdown">
        {currentMarkdown(snapshot).map((block) =>
          block.text.length > MAX_DISPLAYED_TEXT ? (
            <DisplayLimit
              key={block.offset}
              document={document}
              offset={node.offset}
            />
          ) : (
            <RenderLimit
              key={block.offset}
              document={document}
              cost={Math.ceil(block.text.length / 64)}
            >
              <MarkdownBlock
                offset={block.offset}
                text={block.text}
                streaming={streaming && block.offset >= snapshot.offset}
              />
            </RenderLimit>
          ),
        )}
      </div>
    </MarkdownScopeContext.Provider>
  );
}
