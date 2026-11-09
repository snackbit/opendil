"use client";
import {
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactElement,
  type ReactNode,
  type Ref,
  Fragment,
} from "react";
import { UiScope } from "../../components/ui/overlays/ui-scope";
import {
  MarkdownBlock,
  MarkdownScopeContext,
  useMarkdownSnapshot,
  type MarkdownScope,
} from "./markdown-blocks";
import {
  currentMarkdown,
  type MarkdownBlock as Block,
} from "./markdown-stream";
import type { DilMarkdownComponents } from "./markdown-components";
import {
  resolveUiPrimitives,
  UiPrimitivesContext,
  type DilUiPrimitives,
} from "../ui-primitives";
import { DiagramOpenContext, type DilDiagram } from "../customization";
import { useLatestCallback, useStableRecord } from "../stable-record";
import {
  serializeRenderedDocument,
  type DilSerializedDocument,
} from "../serialize/serialize-document";

export interface DilMarkdownRendererHandle {
  /** The rendered Markdown as sanitized HTML and as Markdown text. */
  serialize(): DilSerializedDocument;
}
export interface MarkdownRendererProps {
  ref?: Ref<DilMarkdownRendererHandle> | undefined;
  /** Markdown source. Unlike DilRenderer, it may be replaced at any time. */
  text: string;
  /** Completes unfinished formatting in the trailing block while true. */
  isStreaming?: boolean | undefined;
  /**
   * Renders phrasing content only, inside spans: paragraphs, headings, lists,
   * quotes, and tables keep their text and inline formatting without block
   * elements, and fenced code becomes inline code. The line breaks between
   * blocks stay in the text, so `white-space: pre-wrap` keeps paragraphs
   * apart. Use it inside a line of host text, such as a label or a title.
   */
  inline?: boolean | undefined;
  appearance?: "light" | "dark" | undefined;
  tokens?: Readonly<Record<`--${string}`, string>> | undefined;
  /** `"inherit"` takes colors, radius, and font from the host page. */
  theme?: "stock" | "inherit" | undefined;
  className?: string | undefined;
  markdownComponents?: DilMarkdownComponents | undefined;
  /** Your buttons and tooltips in code block controls, as on DilRenderer. */
  uiPrimitives?: DilUiPrimitives | undefined;
  /** Opens a rendered mermaid fence in your viewer, as on DilRenderer. */
  onOpenDiagram?: ((diagram: DilDiagram) => void) | undefined;
}
const NO_COMPONENTS: DilMarkdownComponents = Object.freeze({});
const literal = (children: ReactNode) => children;
const EMPTY: DilSerializedDocument = { html: "", markdown: "" };
/**
 * Inline, blocks lose their boundaries. The line breaks between them in the
 * source keep them apart: a host's `white-space: pre-wrap` shows paragraph
 * breaks, and normal white space collapses them to one space.
 */
function blockSeparator(source: string, previous: Block, next: Block) {
  const gap = source.slice(previous.offset + previous.text.length, next.offset);
  return "\n".repeat(Math.max(1, gap.split("\n").length - 1));
}
/**
 * Renders Markdown with OpenDIL's styles and Markdown overrides, without DIL:
 * tags, braces, and directives display as text. It starts no parser or
 * expression worker, so it suits text that must stay literal, such as what
 * a user typed.
 */
export function MarkdownRenderer({
  ref,
  text,
  isStreaming = false,
  inline = false,
  appearance = "light",
  tokens,
  theme = "stock",
  className,
  markdownComponents: markdownComponentsProp,
  uiPrimitives: uiPrimitivesProp,
  onOpenDiagram,
}: MarkdownRendererProps): ReactElement {
  const markdownComponents = useStableRecord(markdownComponentsProp);
  const uiPrimitives = useStableRecord(uiPrimitivesProp);
  const openDiagram = useLatestCallback(onOpenDiagram);
  const snapshot = useMarkdownSnapshot(text, !isStreaming);
  const root = useRef<HTMLElement | null>(null);
  const attach = useCallback((element: HTMLElement | null) => {
    root.current = element;
  }, []);
  useImperativeHandle(
    ref,
    () => ({
      serialize: () =>
        root.current ? serializeRenderedDocument(root.current) : EMPTY,
    }),
    [],
  );
  const scope = useMemo<MarkdownScope>(
    () => ({
      components: markdownComponents ?? NO_COMPONENTS,
      substitute: literal,
      expressions: false,
      presentation: "markdown-renderer",
      inline,
      phrasing: inline,
    }),
    [markdownComponents, inline],
  );
  const primitives = useMemo(
    () => resolveUiPrimitives(uiPrimitives),
    [uiPrimitives],
  );
  const current = currentMarkdown(snapshot);
  const blocks = (
    <MarkdownScopeContext.Provider value={scope}>
      {current.map((block, index) => {
        const previous = inline ? current[index - 1] : undefined;
        return (
          <Fragment key={block.offset}>
            {previous && blockSeparator(snapshot.source, previous, block)}
            <MarkdownBlock
              offset={block.offset}
              text={block.text}
              streaming={isStreaming && block.offset >= snapshot.offset}
            />
          </Fragment>
        );
      })}
    </MarkdownScopeContext.Provider>
  );
  return (
    <UiPrimitivesContext.Provider value={primitives}>
      <DiagramOpenContext.Provider value={openDiagram}>
        <UiScope
          {...(className ? { className } : {})}
          {...(tokens ? { tokens } : {})}
          appearance={appearance}
          theme={theme}
          inline={inline}
        >
          {inline ? (
            <span
              ref={attach}
              className="dil-markdown dil-inline"
              data-dil-markdown-renderer="true"
              data-dil-inline="true"
            >
              {blocks}
            </span>
          ) : (
            <div
              ref={attach}
              className="dil-document"
              data-dil-document="markdown"
              data-dil-markdown-renderer="true"
            >
              <div className="dil-flow">
                <div className="dil-markdown">{blocks}</div>
              </div>
            </div>
          )}
        </UiScope>
      </DiagramOpenContext.Provider>
    </UiPrimitivesContext.Provider>
  );
}
