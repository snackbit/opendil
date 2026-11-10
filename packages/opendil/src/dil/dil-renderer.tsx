"use client";
import { Suspense, use, useState, type Ref } from "react";
import type { DilRendererHandle } from "./renderer-handle";
import type { DilCustomization } from "./customization";
import { IsolatedRenderer } from "./isolation/isolated-renderer";
import type { RendererMetrics } from "./renderer-environment";
import type { DilRenderError } from "./render-error";
import type { ProgressiveReveal } from "./view/reveal-options";
import type { DilSnapshot } from "./document-cache";
import type { AutoScroll, ScrollContainer } from "./view/scroll-options";
import {
  parseUpdateInterval,
  type UpdateInterval,
} from "./runtime/presentation-scheduler";
import type * as StyledRendererModule from "./styled-renderer";

// The iframe mode needs only the frame bridge. Host and Shadow DOM modes embed
// the parser and QuickJS workers, so pages that never use them never load them.
type StyledModule = typeof StyledRendererModule;
// React's use() returns the value of a promise marked as fulfilled without
// suspending, so a loaded module renders synchronously on every later render.
let styledLoad: Promise<StyledModule> | undefined;
let styledModule: StyledModule | undefined;
function loadStyledRenderer() {
  if (!styledLoad) {
    const load: Promise<StyledModule> = import("./styled-renderer").then(
      (module) => {
        Object.assign(load, { status: "fulfilled", value: module });
        styledModule = module;
        return module;
      },
      (error: unknown) => {
        // A later render retries a chunk that failed to load.
        styledLoad = undefined;
        throw error;
      },
    );
    styledLoad = load;
  }
  return styledLoad;
}
let preload: Promise<void> | undefined;
/**
 * Starts loading the code that `mode="host"` and `mode="shadow"` share. Once
 * it resolves, those modes render synchronously: their `ref` is set in the
 * first commit and `renderToString` includes them. Every call returns the
 * same promise, so a host can `use()` it in one boundary above its answers.
 * Loading also starts the expression runtime that the first answer adopts.
 */
export function preloadHostRenderer(): Promise<void> {
  if (!preload) {
    const promise: Promise<void> = loadStyledRenderer().then(
      (module) => {
        // After the caller's current work, such as a test installing its
        // worker replacements. Pages without workers never boot one, and
        // neither do server runtimes that have workers but no window.
        if (typeof window !== "undefined" && typeof Worker === "function")
          setTimeout(() => module.warmExpressionRuntime(), 0);
        // use() then reads it without suspending.
        Object.assign(promise, { status: "fulfilled", value: undefined });
      },
      (error: unknown) => {
        // A later call retries a chunk that failed to load.
        preload = undefined;
        throw error;
      },
    );
    preload = promise;
  }
  return preload;
}
/**
 * Drops the finished answers that `cacheKey` keeps in host and Shadow DOM
 * modes: later renderers parse and evaluate again, and answers on screen keep
 * working until they unmount. For hosts that end a user's session, and for
 * tests and story runners that must not carry one case's answers and reader
 * state into the next.
 */
export function clearDocumentCache(): void {
  // Nothing is cached before the host code loads.
  styledModule?.clearDocumentCache();
}
/**
 * Suspends only while the shared host and Shadow DOM code loads. Each
 * instance keeps the path it mounted with: switching from the awaiting path
 * to the loaded one would change the component type and remount the answer,
 * losing its state.
 */
function StyledRenderer(props: StyledRendererModule.StyledRendererProps) {
  // Loaded code renders without use(): inside a test's synchronous act(),
  // use() makes React defer the retries of Suspense boundaries in the answer
  // (a lazy host component, say) to act's queue, where they never resume.
  const [awaiting] = useState(() => styledModule === undefined);
  if (awaiting || !styledModule) return <AwaitStyledRenderer {...props} />;
  return <styledModule.StyledRenderer {...props} />;
}
/**
 * Suspends until the code loads. It keeps calling use(), which returns the
 * loaded module without suspending, for as long as its instance lives.
 */
function AwaitStyledRenderer(props: StyledRendererModule.StyledRendererProps) {
  const module = use(loadStyledRenderer());
  return <module.StyledRenderer {...props} />;
}

interface DilCommonProps {
  ref?: Ref<DilRendererHandle> | undefined;
  /** Append-only source prefix. Remount with a new key to replace it. */
  text: string;
  isStreaming?: boolean;
  /**
   * Show the "Receiving document", "Incomplete" or "Complete" label. Errors
   * and the note that a response ended early stay visible when false.
   */
  showStatus?: boolean;
  /** Stagger newly shown blocks; disabled by default and under reduced motion. */
  progressiveReveal?: ProgressiveReveal;
  autoScroll?: AutoScroll;
  /**
   * What scrolls around the renderer, for `autoScroll` and for virtualized
   * long content. Defaults to `"auto"`: the nearest ancestor that scrolls
   * vertically, crossing Shadow DOM boundaries, or the window when none does.
   * Pass `"window"`, an element, or a ref to an element to choose one.
   */
  scrollContainer?: ScrollContainer | undefined;
  /** Maximum streaming presentation frequency; user interaction remains immediate. */
  updateInterval?: UpdateInterval;
  /** Color scheme of the stock components. Defaults to "light". */
  appearance?: "light" | "dark" | undefined;
  /**
   * CSS custom properties applied to the renderer root, such as `--primary` or
   * `--background`. The iframe mode accepts only values that cannot load
   * resources and ignores the rest with a console warning.
   */
  tokens?: Readonly<Record<`--${string}`, string>> | undefined;
  /**
   * URL of the directory that serves frame.html. Defaults to "/opendil/". Only
   * the iframe mode loads it; host and Shadow DOM modes ignore it, so a mode
   * chosen at runtime can always pass the app's runtime location.
   */
  runtimeBaseUrl?: string | undefined;
  onFollowChange?: (following: boolean) => void;
  onInput?: (detail: { length: number }) => void;
  onCommit?: (detail: RendererMetrics) => void;
  /**
   * Receives each distinct problem once, with a stable `code`, a
   * developer-facing message and, for parse problems, the offset in `text`.
   * Readers see short generic wording instead, or the `diagnostics.Problem`
   * component. Syntax problems and documents that ended with unfinished
   * structure are also logged with `console.warn` unless
   * `diagnostics.console` is false. One message reports at most
   * 20 problems, then one `limit` error; the `incomplete` report always
   * arrives. An exception thrown here is rethrown asynchronously and does not
   * interrupt rendering.
   */
  onError?: ((error: DilRenderError) => void) | undefined;
}
export interface DilIsolatedRendererProps extends DilCommonProps {
  mode?: "isolated" | undefined;
  components?: undefined;
  componentConfig?: undefined;
  classNames?: undefined;
  slots?: undefined;
  markdownComponents?: undefined;
  diagnostics?: undefined;
  uiPrimitives?: undefined;
  onOpenDiagram?: undefined;
  onSettled?: undefined;
  cacheKey?: undefined;
  snapshot?: undefined;
  onSnapshot?: undefined;
  className?: undefined;
  theme?: undefined;
  shadowStyles?: undefined;
}
interface DilStyledRendererProps extends DilCommonProps, DilCustomization {
  /**
   * Called once, when the complete document has the final layout readers
   * can see: no evaluation is queued or running and no placeholder in view is
   * pending, including lazily loaded widgets. A widget outside the visible
   * area keeps its reserved height while it loads and does not delay it. The
   * renderer root carries `data-dil-settled` ("false", then "true") for hosts
   * that watch the DOM instead.
   */
  onSettled?: (() => void) | undefined;
  /**
   * Your identity for a finished answer, such as a message id with a hash of
   * its text. A renderer that mounts with the key and text of one that
   * unmounted adopts its live document, results and state: no worker job,
   * and charts and graphs mount in turns inside their measured heights.
   * OpenDIL keeps up to 12 such documents.
   */
  cacheKey?: string | undefined;
  /**
   * A snapshot from `onSnapshot` for this text. Its results show in the
   * first commit and the expression runtime then confirms them; a snapshot
   * of other text is ignored.
   */
  snapshot?: DilSnapshot | undefined;
  /**
   * Receives the answer's snapshot when a finished answer first settles. If
   * widgets out of view were still loading then, it receives the snapshot
   * again with their heights once they have laid out; keep the latest.
   */
  onSnapshot?: ((snapshot: DilSnapshot) => void) | undefined;
  className?: string | undefined;
  /**
   * `"stock"` (default) applies OpenDIL's colors, radius, and font. `"inherit"`
   * leaves those design variables (`--background`, `--foreground`, `--primary`,
   * `--border`, `--radius`, `--chart-1`…) to the host page, which must then
   * define them; `tokens` still applies on top.
   */
  theme?: "stock" | "inherit" | undefined;
}
export interface DilHostRendererProps extends DilStyledRendererProps {
  mode: "host";
  shadowStyles?: undefined;
}
export interface DilShadowRendererProps extends DilStyledRendererProps {
  mode: "shadow";
  /** Trusted application CSS installed inside this renderer's ShadowRoot. */
  shadowStyles?: string | undefined;
}
export type DilRendererProps =
  DilIsolatedRendererProps | DilHostRendererProps | DilShadowRendererProps;
const styledOnly = [
  "components",
  "componentConfig",
  "classNames",
  "slots",
  "markdownComponents",
  "diagnostics",
  "uiPrimitives",
  "onOpenDiagram",
  "onSettled",
  "cacheKey",
  "snapshot",
  "onSnapshot",
  "className",
  "theme",
  "shadowStyles",
] as const;
export function DilRenderer(props: DilRendererProps) {
  const updateInterval = parseUpdateInterval(props.updateInterval);
  if (props.mode !== "host" && props.mode !== "shadow") {
    // Untyped callers can still pass these; undefined means "not set".
    const unsupported = styledOnly.filter((key) => props[key] !== undefined);
    if (unsupported.length)
      throw new Error(
        `OpenDIL customization (${unsupported.join(", ")}) requires mode="host" or mode="shadow".`,
      );
    return <IsolatedRenderer {...props} updateInterval={updateInterval} />;
  }
  // The boundary stays in place after the code loads, so the tree keeps its
  // shape and hydration matches the server. It also catches custom components
  // that suspend; wrap those in your own Suspense to show a fallback.
  return (
    <Suspense fallback={null}>
      <StyledRenderer
        mode={props.mode}
        rendererRef={props.ref}
        text={props.text}
        isStreaming={props.isStreaming ?? false}
        showStatus={props.showStatus ?? true}
        progressiveReveal={props.progressiveReveal ?? false}
        autoScroll={props.autoScroll ?? false}
        scrollContainer={props.scrollContainer}
        updateInterval={updateInterval}
        onFollowChange={props.onFollowChange}
        onInput={props.onInput}
        onCommit={props.onCommit}
        onSettled={props.onSettled}
        cacheKey={props.cacheKey}
        snapshot={props.snapshot}
        onSnapshot={props.onSnapshot}
        onError={props.onError}
        components={props.components}
        componentConfig={props.componentConfig}
        classNames={props.classNames}
        slots={props.slots}
        markdownComponents={props.markdownComponents}
        diagnostics={props.diagnostics}
        uiPrimitives={props.uiPrimitives}
        onOpenDiagram={props.onOpenDiagram}
        className={props.className}
        theme={props.theme ?? "stock"}
        appearance={props.appearance ?? "light"}
        tokens={props.tokens}
        shadowStyles={props.mode === "shadow" ? props.shadowStyles : undefined}
      />
    </Suspense>
  );
}
