"use client";
import {
  createContext,
  createElement,
  lazy,
  memo,
  Suspense,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import renderMarkdown, {
  defaultUrlTransform,
  type Components,
  type ExtraProps,
  type Options,
} from "react-markdown";
import { RenderCache } from "../widgets/render-cache";
import remarkGfm from "remark-gfm";
import remend from "remend";
import type { Element, Root, RootContent } from "hast";
import { usePresentationTarget } from "../view/reveal/presentation";
import { CodeFrame } from "../widgets/code/code-frame";
import { PendingBlock } from "../view/loading-block";
import {
  advanceMarkdown,
  EMPTY_MARKDOWN,
  type MarkdownSnapshot,
} from "./markdown-stream";
import {
  hostText,
  hostUrl,
  markdownUrlTransform,
  type DilMarkdownCodeProps,
  type DilMarkdownComponents,
} from "./markdown-components";
const MermaidDiagram = lazy(() =>
  import("../widgets/mermaid-diagram").then((module) => ({
    default: module.MermaidDiagram,
  })),
);

/** How the Markdown elements of one DIL node, `<Markdown>` block, or MarkdownRenderer render. */
export interface MarkdownScope {
  components: DilMarkdownComponents;
  /** Replaces expression placeholders in text; identity for literal Markdown. */
  substitute: (children: ReactNode) => ReactNode;
  /** Whether text contains expression placeholders, which URLs must not carry. */
  expressions: boolean;
  /** Identifies the source in progressive-reveal keys. */
  presentation: string;
  /** Where the text starts in the message source, which the reveal rule compares. */
  origin?: number;
  /** Paragraphs render as spans, for Markdown inside an inline DIL node. */
  inline: boolean;
  /** Only phrasing elements render; block elements give way to their content. */
  phrasing?: boolean;
}
// Elements that may appear inside a span. Fenced code keeps its <code>.
const PHRASING = ["a", "img", "code", "strong", "em", "del", "br", "input"];
/** Stock literal Markdown, for blocks rendered outside a scope provider. */
export const MarkdownScopeContext = createContext<MarkdownScope>({
  components: {},
  substitute: (children) => children,
  expressions: false,
  presentation: "",
  inline: false,
});
function useScope() {
  return useContext(MarkdownScopeContext);
}
const BlockContext = createContext({ offset: 0, streaming: false });
type MarkdownProps = ExtraProps & {
  children?: ReactNode;
  className?: string | undefined;
  start?: number | undefined;
};
function usePresentation(
  tag: string,
  reveal: boolean,
  node: MarkdownProps["node"],
) {
  const scope = useScope();
  const { offset } = useContext(BlockContext);
  const role = reveal
    ? tag === "li"
      ? ":li"
      : ["ul", "ol"].includes(tag)
        ? ":list"
        : ""
    : ":inline:" + tag;
  const position = offset + (node?.position?.start.offset ?? 0);
  return usePresentationTarget(
    "markdown:" + scope.presentation + ":" + role + ":" + position,
    reveal && !scope.inline,
    (scope.origin ?? 0) + position,
  );
}
function element(tag: string, reveal: boolean) {
  return function MarkdownElement({ children, node, start }: MarkdownProps) {
    const scope = useScope();
    const ref = usePresentation(tag, reveal, node);
    return createElement(
      tag === "p" && scope.inline ? "span" : tag,
      { ref, ...(tag === "ol" ? { start } : {}) },
      scope.substitute(children),
    );
  };
}
function heading(level: 1 | 2 | 3 | 4 | 5 | 6) {
  return function MarkdownHeading({ children, node }: MarkdownProps) {
    const scope = useScope();
    const ref = usePresentation("h" + level, true, node);
    const Heading = scope.components.heading;
    const content = scope.substitute(children);
    return Heading ? (
      <Heading level={level} presentationRef={ref}>
        {content}
      </Heading>
    ) : (
      createElement("h" + level, { ref }, content)
    );
  };
}
function MarkdownLink({
  children,
  node,
  href,
  title,
}: MarkdownProps & { href?: string | undefined; title?: string | undefined }) {
  const scope = useScope();
  const { streaming } = useContext(BlockContext);
  const ref = usePresentation("span", false, node);
  const content = scope.substitute(children);
  const Link = scope.components.link;
  const url = hostUrl(href, scope.expressions);
  if (!Link || url === undefined) return <span ref={ref}>{content}</span>;
  return (
    <Link
      href={url}
      title={hostText(title, scope.expressions)}
      streaming={streaming}
    >
      {content}
    </Link>
  );
}
function MarkdownImage({
  src,
  alt,
  title,
}: MarkdownProps & {
  src?: string | undefined;
  alt?: string | undefined;
  title?: string | undefined;
}) {
  const scope = useScope();
  const Image = scope.components.image;
  const url = hostUrl(src, scope.expressions);
  if (!Image || url === undefined) return null;
  return (
    <Image
      src={url}
      alt={hostText(alt ?? "", scope.expressions) ?? ""}
      title={hostText(title, scope.expressions)}
    />
  );
}
type PresentationRef = (element: HTMLElement | null) => void;
// The fence's reveal target, so Default attaches it under a host override too.
const FenceRevealContext = createContext<PresentationRef | undefined>(
  undefined,
);
function MermaidCode({
  source,
  presentationRef,
}: {
  source: string;
  presentationRef?: PresentationRef | undefined;
}) {
  return (
    <Suspense fallback={<PendingBlock name="Mermaid" />}>
      <MermaidDiagram source={source} presentationRef={presentationRef} />
    </Suspense>
  );
}
/**
 * Stock code rendering, which host code overrides receive as Default. Fenced
 * code gets the CodeBlock frame: language label, word wrap, and copy.
 */
function StockCode({
  language,
  source,
  block,
  streaming,
}: Omit<DilMarkdownCodeProps, "Default">) {
  const presentationRef = useContext(FenceRevealContext);
  if (!block)
    return (
      <code className={language ? "language-" + language : undefined}>
        {source}
      </code>
    );
  return language === "mermaid" ? (
    <MermaidCode source={source} presentationRef={presentationRef} />
  ) : (
    <CodeFrame
      source={source}
      language={language}
      ready={!streaming}
      presentationRef={presentationRef}
    />
  );
}
// MarkdownPre renders fenced code, so this is inline code, or a fence whose
// <pre> phrasing content unwrapped.
function MarkdownCode({ children, className }: MarkdownProps) {
  const Code = useScope().components.code;
  const { streaming } = useContext(BlockContext);
  if (Code)
    return (
      <Code
        language=""
        source={String(children)}
        block={false}
        streaming={streaming}
        Default={StockCode}
      />
    );
  return <code className={className}>{children}</code>;
}
type HastNode = NonNullable<MarkdownProps["node"]>["children"][number];
function hastText(node: HastNode): string {
  if (node.type === "text") return node.value;
  return node.type === "element" ? node.children.map(hastText).join("") : "";
}
function MarkdownPre({ children, node }: MarkdownProps) {
  const scope = useScope();
  const { streaming } = useContext(BlockContext);
  const ref = usePresentation("pre", true, node);
  const code = node?.children.find(
    (child) => child.type === "element" && child.tagName === "code",
  );
  if (code?.type !== "element")
    return <pre ref={ref}>{scope.substitute(children)}</pre>;
  const classes = code.properties.className;
  const language = (Array.isArray(classes) ? classes : [])
    .map(String)
    .find((name) => name.startsWith("language-"))
    ?.slice("language-".length);
  const props = {
    language: language ?? "",
    source: hastText(code).replace(/\n$/, ""),
    block: true,
    streaming,
  };
  const Code = scope.components.code;
  return (
    <FenceRevealContext.Provider value={ref}>
      {Code ? (
        <Code {...props} Default={StockCode} />
      ) : (
        <StockCode {...props} />
      )}
    </FenceRevealContext.Provider>
  );
}
function MarkdownBlockquote({ children }: MarkdownProps) {
  const Blockquote = useScope().components.blockquote;
  return Blockquote ? (
    <Blockquote>{children}</Blockquote>
  ) : (
    <blockquote>{children}</blockquote>
  );
}
function MarkdownTable({ children }: MarkdownProps) {
  const Table = useScope().components.table;
  return Table ? <Table>{children}</Table> : <table>{children}</table>;
}
const COMPONENTS = {
  a: MarkdownLink,
  img: MarkdownImage,
  code: MarkdownCode,
  pre: MarkdownPre,
  blockquote: MarkdownBlockquote,
  table: MarkdownTable,
  p: element("p", true),
  h1: heading(1),
  h2: heading(2),
  h3: heading(3),
  h4: heading(4),
  h5: heading(5),
  h6: heading(6),
  strong: element("strong", false),
  em: element("em", false),
  del: element("del", false),
  td: element("td", false),
  th: element("th", false),
  li: element("li", true),
  ul: element("ul", true),
  ol: element("ol", true),
} satisfies Components;
const PLUGINS = [remarkGfm];
const blank = (node: RootContent | undefined) =>
  node?.type === "text" && node.value.trim() === "";
/**
 * Phrasing content unwraps block elements, so the line breaks that only
 * separate their children in HTML would become text. Breaks between children
 * stay and keep list items and cells apart; those at either end go.
 */
function trimUnwrapped(node: Root | Element) {
  const children: RootContent[] = node.children;
  if (node.type === "element" && !PHRASING.includes(node.tagName)) {
    while (blank(children[0])) children.shift();
    while (blank(children.at(-1))) children.pop();
  }
  for (const child of children)
    if (child.type === "element") trimUnwrapped(child);
}
const PHRASING_PLUGINS = [() => trimUnwrapped];
type UrlTransform = NonNullable<Options["urlTransform"]>;
/**
 * The elements of finished blocks, by URL policy, flags and text.
 * react-markdown's synchronous entry point is a function of its options
 * without hooks, so its result is a value that every renderer of the same
 * block can show: parsing a block again was a tenth to a fifth of the time a
 * finished answer took to mount again.
 */
const RENDERED = new RenderCache<ReactNode>(1024, 1_000_000);
// A policy's blocks leave the cache by age once nothing renders under it.
const POLICIES = new WeakMap<UrlTransform, number>();
let policies = 0;
function renderBlock(
  source: string,
  phrasing: boolean,
  urlTransform: UrlTransform,
  keep: boolean,
): ReactNode {
  let policy = POLICIES.get(urlTransform);
  if (policy === undefined) POLICIES.set(urlTransform, (policy = ++policies));
  const key = policy + (phrasing ? "p" : "b") + source;
  const known = keep ? RENDERED.get(key) : undefined;
  if (known !== undefined) return known;
  const rendered = renderMarkdown({
    children: source,
    remarkPlugins: PLUGINS,
    components: COMPONENTS,
    urlTransform,
    ...(phrasing
      ? {
          allowedElements: PHRASING,
          unwrapDisallowed: true,
          rehypePlugins: PHRASING_PLUGINS,
        }
      : {}),
  });
  if (keep) RENDERED.set(key, rendered, source.length);
  return rendered;
}
/** One Markdown block; finished blocks keep their element identity as text streams. */
export const MarkdownBlock = memo(function MarkdownBlock({
  text,
  offset,
  streaming,
}: {
  text: string;
  offset: number;
  streaming: boolean;
}) {
  const source = streaming ? remend(text, { linkMode: "text-only" }) : text;
  const block = useMemo(() => ({ offset, streaming }), [offset, streaming]);
  const { components, expressions, phrasing } = useScope();
  const transform = components.urlTransform;
  const urlTransform = useMemo(
    () => markdownUrlTransform(transform, expressions, defaultUrlTransform),
    [transform, expressions],
  );
  // A streaming block changes with every chunk and is never shown again.
  const rendered = useMemo(
    () => renderBlock(source, phrasing === true, urlTransform, !streaming),
    [source, phrasing, urlTransform, streaming],
  );
  return (
    <BlockContext.Provider value={block}>{rendered}</BlockContext.Provider>
  );
});
/**
 * Splits growing Markdown into blocks. Only the trailing block is parsed
 * again; a source that is not an extension of the previous one starts over.
 */
export function useMarkdownSnapshot(
  source: string,
  complete: boolean,
  frozen = false,
): MarkdownSnapshot {
  // Text complete at mount renders its blocks once, without a layout-time
  // update; growing text commits each snapshot for the next to extend.
  const [committed, setCommitted] = useState(() =>
    frozen ? EMPTY_MARKDOWN : advanceMarkdown(EMPTY_MARKDOWN, source, complete),
  );
  const snapshot = frozen
    ? committed
    : advanceMarkdown(committed, source, complete);
  useLayoutEffect(() => {
    if (snapshot !== committed) setCommitted(snapshot);
  }, [snapshot, committed]);
  return snapshot;
}
