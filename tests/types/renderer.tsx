import {
  clearDocumentCache,
  DilRenderer,
  preloadHostRenderer,
  type DilComponentProps,
  type DilDiagnostics,
  type DilMarkdownCodeProps,
  type DilMarkdownComponents,
  type DilMarkdownLinkProps,
  type DilProblemProps,
  type DilRenderError,
  type DilRenderErrorCode,
  type DilRenderErrorKind,
  type RendererMetrics,
  type ScrollContainer,
  type DilButtonProps,
  type DilDiagram,
  type DilPopoverContentProps,
  type DilRendererHandle,
  type DilTooltipProps,
  type DilUiPrimitives,
} from "@snackbit/opendil";
import {
  agentSpec,
  Button,
  exportSvg,
  extractDilText,
  literalMarkdown,
  MarkdownRenderer,
  rasterizeSvg,
  serializeRenderedDocument,
  type DilComponentReference,
  type DilMarkdownRendererHandle,
  type DilSerializedDocument,
  type DilTextResult,
} from "@snackbit/opendil/lib";
import { installInlineWorkers } from "@snackbit/opendil/testing";
import { useRef } from "react";
function Custom({ children }: DilComponentProps) {
  return <aside>{children}</aside>;
}
export const isolated = (
  <DilRenderer text="# Stock" runtimeBaseUrl="/assets/" progressiveReveal />
);
export const host = (
  <DilRenderer
    mode="host"
    progressiveReveal
    text="<Custom>Content</Custom>"
    components={{ Custom }}
    tokens={{ "--primary": "purple" }}
  />
);
// @ts-expect-error Custom components require an explicit host-mode choice.
export const rejected = <DilRenderer text="" components={{ Custom }} />;
// Host and Shadow DOM modes ignore the runtime location.
export const hostWithRuntime = (
  <DilRenderer mode="host" text="" runtimeBaseUrl="/assets/" />
);
declare const mode: "isolated" | "shadow" | "host";
declare const dark: boolean;
// A runtime mode choice accepts every prop that is valid in all modes,
// including the app's runtime location under a base path.
export const anyMode = (
  <DilRenderer
    mode={mode}
    text=""
    runtimeBaseUrl="/base/opendil/"
    appearance={dark ? "dark" : "light"}
    tokens={{ "--background": "transparent" }}
  />
);
export const preloaded: Promise<void> = preloadHostRenderer();
export const cleared: () => void = clearDocumentCache;
// The iframe mode accepts theme props, and undefined means "not set".
export const isolatedTheme = (
  <DilRenderer
    text=""
    appearance="dark"
    tokens={{ "--primary": "#5e4cff" }}
    className={undefined}
    components={undefined}
  />
);
export const rejectedRuntimeCustomization = (
  // @ts-expect-error Custom components are not valid in every mode.
  <DilRenderer mode={mode} text="" components={{ Custom }} />
);
export const rejectedIsolatedClassName = (
  // @ts-expect-error Class names style host or shadow renderers only.
  <DilRenderer text="" className="answer" />
);
// Every mode reports typed errors and the incomplete flag.
function logError(error: DilRenderError) {
  const kind: DilRenderErrorKind = error.kind;
  const offset: number | undefined = error.offset;
  console.warn(kind, error.message, offset);
}
export const reporting = (
  <DilRenderer
    mode={mode}
    text=""
    onError={logError}
    onCommit={(detail: RendererMetrics) => detail.incomplete}
  />
);
export const rejectedErrorKind = (
  <DilRenderer
    text=""
    // @ts-expect-error Error kinds are a closed set.
    onError={(error: { kind: "fatal" }) => error}
  />
);
// Every mode accepts a scroll container: detection, the page, an element, or a ref.
export function ScrollContainers({ log }: { log: HTMLElement | null }) {
  const list = useRef<HTMLDivElement>(null);
  const choices: ScrollContainer[] = ["auto", "window", log, list];
  return (
    <div ref={list}>
      {choices.map((choice, index) => (
        <DilRenderer
          key={index}
          mode={mode}
          text=""
          autoScroll
          scrollContainer={choice}
        />
      ))}
      <DilRenderer text="" scrollContainer={undefined} />
    </div>
  );
}
export const rejectedScrollContainer = (
  // @ts-expect-error Selectors are not scroll containers.
  <DilRenderer text="" scrollContainer="#log" />
);
// Host Markdown overrides, diagnostics, and theme inheritance are styled-mode props.
const markdownComponents: DilMarkdownComponents = {
  link: ({ href, children }: DilMarkdownLinkProps) => (
    <a href={href}>{children}</a>
  ),
  code: ({ Default, ...props }: DilMarkdownCodeProps) => <Default {...props} />,
  heading: ({ level, children }) => <p data-level={level}>{children}</p>,
};
function Problem({ scope, error }: DilProblemProps) {
  const code: DilRenderErrorCode = error.code;
  return <span data-scope={scope}>{code}</span>;
}
const diagnostics: DilDiagnostics = { console: false, Problem };
export const hostMarkdown = (
  <DilRenderer
    mode="host"
    text=""
    theme="inherit"
    markdownComponents={markdownComponents}
    diagnostics={diagnostics}
  />
);
export const rejectedIsolatedMarkdown = (
  // @ts-expect-error Markdown overrides need host or shadow mode.
  <DilRenderer text="" markdownComponents={markdownComponents} />
);
export const rejectedIsolatedDiagnostics = (
  // @ts-expect-error Diagnostics need host or shadow mode.
  <DilRenderer text="" diagnostics={diagnostics} />
);
export const rejectedIsolatedTheme = (
  // @ts-expect-error The iframe cannot inherit page variables.
  <DilRenderer text="" theme="inherit" />
);
export const rejectedTheme = (
  // @ts-expect-error Themes are a closed set.
  <DilRenderer mode="host" text="" theme="host" />
);
export const rejectedCode = (
  <DilRenderer
    mode="host"
    text=""
    // @ts-expect-error Error codes are a closed set.
    onError={(error: { code: "fatal" }) => error}
  />
);
export const markdownOnly = (
  <MarkdownRenderer
    text="# Literal"
    isStreaming
    appearance="dark"
    theme="inherit"
    tokens={{ "--font-dil": "serif" }}
    markdownComponents={markdownComponents}
  />
);
const extracted: DilTextResult = extractDilText(literalMarkdown("x"), {
  maxLength: 10,
});
export const references: readonly DilComponentReference[] =
  extracted.components;
export const prompt: string = agentSpec;
export const libButton = <Button variant="outline">Lib</Button>;
export const svgFile: Blob = exportSvg("<svg/>");
export const png: Promise<Blob> = rasterizeSvg("<svg/>", {
  scale: 2,
  background: "transparent",
});
export const png3x: Promise<Blob> = rasterizeSvg("<svg/>", {
  scale: 3,
  background: "white",
});
// @ts-expect-error Rasterizing supports only whole scales from 1x to 4x.
void rasterizeSvg("<svg/>", { scale: 1.5, background: "white" });
function openDiagram(diagram: DilDiagram) {
  const size: [number, number] = [diagram.width, diagram.height];
  const parts: [string, string, string | undefined] = [
    diagram.svg,
    diagram.source,
    diagram.title,
  ];
  return [size, parts];
}
export const diagramHook = (
  <DilRenderer mode="host" text="" onOpenDiagram={openDiagram} />
);
export const rejectedIsolatedDiagramHook = (
  // @ts-expect-error The diagram hook needs host or shadow mode.
  <DilRenderer text="" onOpenDiagram={openDiagram} />
);
export const restoreWorkers: () => void = installInlineWorkers();

function HostButton({ variant, size, ...props }: DilButtonProps) {
  return <button data-variant={variant} data-size={size} {...props} />;
}
function HostContent({ portalContainer, children }: DilPopoverContentProps) {
  return <div data-portal={portalContainer?.id}>{children}</div>;
}
function HostTooltip({ children }: DilTooltipProps) {
  return <>{children}</>;
}
const uiPrimitives: DilUiPrimitives = {
  Button: HostButton,
  Popover: {
    Root: ({ children }) => <>{children}</>,
    Trigger: ({ children }) => <>{children}</>,
    Content: HostContent,
  },
  Tooltip: HostTooltip,
};
export const hostPrimitives = (
  <DilRenderer mode="shadow" text="" uiPrimitives={uiPrimitives} />
);
export const rejectedIsolatedPrimitives = (
  // @ts-expect-error UI primitives need host or shadow mode.
  <DilRenderer text="" uiPrimitives={uiPrimitives} />
);
export const rejectedPartialGroup: DilUiPrimitives = {
  // @ts-expect-error Grouped primitives share context and are replaced together.
  Popover: { Root: ({ children }) => <>{children}</> },
};
export function useCopy() {
  const renderer = useRef<DilRendererHandle>(null);
  const markdown = useRef<DilMarkdownRendererHandle>(null);
  const copy: DilSerializedDocument | null | undefined =
    renderer.current?.serialize();
  const literal: DilSerializedDocument | undefined =
    markdown.current?.serialize();
  return [
    <DilRenderer key="d" ref={renderer} mode="host" text="" />,
    <MarkdownRenderer key="m" ref={markdown} text="*a*" inline />,
    copy,
    literal,
    serializeRenderedDocument(document.body).markdown,
  ];
}
export const urlPolicy = (
  <MarkdownRenderer
    text="[a](sandbox:/x)"
    markdownComponents={{
      urlTransform: (url, attribute) =>
        attribute === "href" && url.startsWith("sandbox:") ? url : undefined,
    }}
  />
);
