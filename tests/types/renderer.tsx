import {
  DilRenderer,
  preloadHostRenderer,
  type DilComponentProps,
  type DilRenderError,
  type DilRenderErrorKind,
  type RendererMetrics,
  type ScrollContainer,
} from "@snackbit/opendil";
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
