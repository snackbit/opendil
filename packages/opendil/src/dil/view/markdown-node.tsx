"use client";
import {
  Children,
  cloneElement,
  createElement,
  isValidElement,
  memo,
  createContext,
  useContext,
  useState,
  useLayoutEffect,
  useMemo,
  useCallback,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import { useStore } from "zustand";
import ReactMarkdown, {
  type Components,
  type ExtraProps,
} from "react-markdown";
import remarkGfm from "remark-gfm";
import remend from "remend";
import { RenderLimit } from "./render-limit";
import { usePresentationTarget } from "./reveal/presentation";
import { EvaluationPending, type Scope } from "../runtime/expressions";
import {
  advanceMarkdown,
  currentMarkdown,
  EMPTY_MARKDOWN,
  markdownIndent,
  normalizeMarkdown,
} from "../runtime/markdown-stream";
import type { DilNode } from "../parser/types";
import type { DilDocument } from "../runtime/document";
const MermaidDiagram = lazy(() =>
  import("../widgets/mermaid-diagram").then((module) => ({
    default: module.MermaidDiagram,
  })),
);
interface MarkdownContextValue {
  nodeId: number;
  expressions: readonly string[];
  document: DilDocument;
  scope: Scope;
  inline: boolean;
  instance: string;
}
const MarkdownContext = createContext<MarkdownContextValue | null>(null);
const BlockOffset = createContext(0);
function useMarkdown() {
  const value = useContext(MarkdownContext);
  if (!value) throw new Error("Missing Markdown scope");
  return value;
}
function ExpressionText({ index, token }: { index: number; token: string }) {
  const { expressions, document, scope } = useMarkdown();
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
  if (source === undefined) return token;
  try {
    const value = document.engine.read(source, scope);
    const text =
      typeof value === "string" || typeof value === "number"
        ? value
        : value && typeof value === "object"
          ? "[object Object]"
          : String(value ?? "");
    return (
      <RenderLimit
        document={document}
        cost={Math.ceil(String(text).length / 64)}
      >
        <span>{text}</span>
      </RenderLimit>
    );
  } catch (error) {
    return error instanceof EvaluationPending ? (
      <span aria-busy="true" />
    ) : (
      <span role="alert">Cannot evaluate this value.</span>
    );
  }
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
type MarkdownProps = ExtraProps & {
  children?: ReactNode;
  className?: string | undefined;
};
function element(tag: string, reveal: boolean) {
  return function MarkdownElement({ children, node }: MarkdownProps) {
    const context = useMarkdown(),
      offset = useContext(BlockOffset);
    const role = reveal
      ? tag === "li"
        ? ":li"
        : ["ul", "ol"].includes(tag)
          ? ":list"
          : ""
      : ":inline:" + tag;
    const ref = usePresentationTarget(
      "markdown:" +
        context.nodeId +
        ":" +
        context.instance +
        ":" +
        role +
        ":" +
        (offset + (node?.position?.start.offset ?? 0)),
      reveal && !context.inline,
    );
    return createElement(
      tag === "p" && context.inline ? "span" : tag,
      { ref },
      expressionChildren(children),
    );
  };
}
function MarkdownCode({ children, className }: MarkdownProps) {
  return className === "language-mermaid" ? (
    <Suspense fallback={<span aria-busy="true" />}>
      <MermaidDiagram source={String(children)} />
    </Suspense>
  ) : (
    <code className={className}>{children}</code>
  );
}
const COMPONENTS = {
  code: MarkdownCode,
  a: element("span", false),
  img: () => null,
  p: element("p", true),
  h1: element("h1", true),
  h2: element("h2", true),
  h3: element("h3", true),
  strong: element("strong", false),
  em: element("em", false),
  td: element("td", false),
  th: element("th", false),
  li: element("li", true),
  ul: element("ul", true),
  ol: element("ol", true),
  pre: element("pre", true),
} satisfies Components;
const PLUGINS = [remarkGfm];
const MarkdownBlock = memo(function MarkdownBlock({
  text,
  offset,
  streaming,
}: {
  text: string;
  offset: number;
  streaming: boolean;
}) {
  const source = streaming ? remend(text, { linkMode: "text-only" }) : text;
  return (
    <BlockOffset.Provider value={offset}>
      <ReactMarkdown remarkPlugins={PLUGINS} components={COMPONENTS}>
        {source}
      </ReactMarkdown>
    </BlockOffset.Provider>
  );
});
export interface MarkdownNodeProps {
  node: DilNode;
  document: DilDocument;
  scope: Scope;
  inline: boolean;
  svg: boolean;
  instance: string;
}
export function MarkdownNode({
  node,
  document,
  scope,
  inline,
  svg,
  instance,
}: MarkdownNodeProps) {
  const [indent, setIndent] = useState<number | undefined>(undefined);
  const indentation = indent ?? markdownIndent(node.text);
  const source =
    node.text.length > 65536
      ? ""
      : normalizeMarkdown(node.text, indentation ?? 0);
  const [committed, setCommitted] = useState(EMPTY_MARKDOWN);
  const snapshot = svg
    ? committed
    : advanceMarkdown(committed, source, node.status !== "streaming");
  useLayoutEffect(() => {
    if (indent === undefined && indentation !== undefined)
      setIndent(indentation);
    if (snapshot !== committed) setCommitted(snapshot);
  }, [indent, indentation, snapshot, committed]);
  const context = useMemo(
    () => ({
      nodeId: node.id,
      expressions: node.expressions,
      document,
      scope,
      inline,
      instance,
    }),
    [node.id, node.expressions, document, scope, inline, instance],
  );
  if (!node.text.trim()) return null;
  if (node.text.length > 65536)
    return <p role="alert">Text block exceeds the display limit.</p>;
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
    <MarkdownContext.Provider value={context}>
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
    </MarkdownContext.Provider>
  );
}
