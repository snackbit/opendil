"use client";
import { lazy, Suspense, type Ref } from "react";
import type { DilRendererHandle } from "./renderer-handle";
import type { DilCustomization } from "./customization";
import { IsolatedRenderer } from "./isolation/isolated-renderer";
import type { RendererMetrics } from "./renderer-environment";
import type { ProgressiveReveal } from "./view/reveal-options";
import type { AutoScroll } from "./view/scroll-options";
import {
  parseUpdateInterval,
  type UpdateInterval,
} from "./runtime/presentation-scheduler";
// The iframe mode needs only the frame bridge. Host and Shadow DOM modes embed
// the parser and QuickJS workers, so pages that never use them never load them.
const StyledRenderer = lazy(() =>
  import("./styled-renderer").then((module) => ({
    default: module.StyledRenderer,
  })),
);

interface DilCommonProps {
  ref?: Ref<DilRendererHandle> | undefined;
  /** Append-only source prefix. Remount with a new key to replace it. */
  text: string;
  isStreaming?: boolean;
  /** Show the receiving/completion label without affecting errors. */
  showStatus?: boolean;
  /** Stagger newly shown blocks; disabled by default and under reduced motion. */
  progressiveReveal?: ProgressiveReveal;
  autoScroll?: AutoScroll;
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
  onFollowChange?: (following: boolean) => void;
  onInput?: (detail: { length: number }) => void;
  onCommit?: (detail: RendererMetrics) => void;
}
export interface DilIsolatedRendererProps extends DilCommonProps {
  mode?: "isolated" | undefined;
  /** URL of the directory that serves frame.html. Defaults to "/opendil/". */
  runtimeBaseUrl?: string | undefined;
  components?: never;
  componentConfig?: never;
  classNames?: never;
  slots?: never;
  className?: never;
  shadowStyles?: never;
}
interface DilStyledRendererProps extends DilCommonProps, DilCustomization {
  runtimeBaseUrl?: never;
  className?: string | undefined;
}
export interface DilHostRendererProps extends DilStyledRendererProps {
  mode: "host";
  shadowStyles?: never;
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
  "className",
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
        updateInterval={updateInterval}
        onFollowChange={props.onFollowChange}
        onInput={props.onInput}
        onCommit={props.onCommit}
        components={props.components}
        componentConfig={props.componentConfig}
        classNames={props.classNames}
        slots={props.slots}
        className={props.className}
        appearance={props.appearance ?? "light"}
        tokens={props.tokens}
        shadowStyles={props.mode === "shadow" ? props.shadowStyles : undefined}
      />
    </Suspense>
  );
}
