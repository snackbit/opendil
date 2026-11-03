"use client";
import { lazy, Suspense, useMemo, type Ref } from "react";
import type { DilRendererHandle } from "./renderer-handle";
import { CustomizationContext, type DilCustomization } from "./customization";
import { MessageRenderer } from "./message-renderer";
import { IsolatedRenderer } from "./isolation/isolated-renderer";
import {
  RendererEnvironmentContext,
  type RendererMetrics,
} from "./renderer-environment";
import { UiScope } from "../components/ui/overlays/ui-scope";
import type { ProgressiveReveal } from "./view/reveal-options";
import type { AutoScroll } from "./view/scroll-options";
import {
  parseUpdateInterval,
  type UpdateInterval,
} from "./runtime/presentation-scheduler";
const ShadowRenderer = lazy(() =>
  import("./isolation/shadow-renderer").then((module) => ({
    default: module.ShadowRenderer,
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
  onFollowChange?: (following: boolean) => void;
  onInput?: (detail: { length: number }) => void;
  onCommit?: (detail: RendererMetrics) => void;
}
export interface DilIsolatedRendererProps extends DilCommonProps {
  mode?: "isolated";
  runtimeBaseUrl?: string;
  components?: never;
  componentConfig?: never;
  classNames?: never;
  slots?: never;
  tokens?: never;
  className?: never;
  appearance?: never;
  shadowStyles?: never;
}
interface DilStyledRendererProps extends DilCommonProps, DilCustomization {
  runtimeBaseUrl?: never;
  className?: string;
  tokens?: Readonly<Record<`--${string}`, string>>;
  appearance?: "light" | "dark";
}
export interface DilHostRendererProps extends DilStyledRendererProps {
  mode: "host";
  shadowStyles?: never;
}
export interface DilShadowRendererProps extends DilStyledRendererProps {
  mode: "shadow";
  /** Trusted application CSS installed inside this renderer's ShadowRoot. */
  shadowStyles?: string;
}
export type DilRendererProps =
  DilIsolatedRendererProps | DilHostRendererProps | DilShadowRendererProps;
export function DilRenderer(props: DilRendererProps) {
  const updateInterval = parseUpdateInterval(props.updateInterval);
  const environment = useMemo(
    () => ({
      ...(props.onInput ? { onInput: props.onInput } : {}),
      ...(props.onCommit ? { onCommit: props.onCommit } : {}),
    }),
    [props.onInput, props.onCommit],
  );
  const customization = useMemo(
    () => ({
      ...(props.components ? { components: props.components } : {}),
      ...(props.componentConfig
        ? { componentConfig: props.componentConfig }
        : {}),
      ...(props.classNames ? { classNames: props.classNames } : {}),
      ...(props.slots ? { slots: props.slots } : {}),
    }),
    [props.components, props.componentConfig, props.classNames, props.slots],
  );
  if (props.mode !== "host" && props.mode !== "shadow") {
    if (
      [
        "components",
        "componentConfig",
        "classNames",
        "slots",
        "tokens",
        "className",
        "appearance",
        "shadowStyles",
      ].some((key) => key in props)
    )
      throw new Error(
        'OpenDIL customization requires mode="host" or mode="shadow".',
      );
    return <IsolatedRenderer {...props} updateInterval={updateInterval} />;
  }
  const content = (
    <UiScope
      {...(props.className ? { className: props.className } : {})}
      appearance={props.appearance ?? "light"}
      {...(props.tokens ? { tokens: props.tokens } : {})}
    >
      <MessageRenderer
        updateInterval={updateInterval}
        text={props.text}
        isStreaming={props.isStreaming ?? false}
        showStatus={props.showStatus ?? true}
        progressiveReveal={props.progressiveReveal ?? false}
        autoScroll={props.autoScroll ?? false}
        onFollowChange={props.onFollowChange}
        rendererRef={props.ref}
      />
    </UiScope>
  );
  return (
    <RendererEnvironmentContext.Provider value={environment}>
      <CustomizationContext.Provider value={customization}>
        {props.mode === "shadow" ? (
          <Suspense fallback={null}>
            <ShadowRenderer shadowStyles={props.shadowStyles}>
              {content}
            </ShadowRenderer>
          </Suspense>
        ) : (
          <div data-dil-mode="host">{content}</div>
        )}
      </CustomizationContext.Provider>
    </RendererEnvironmentContext.Provider>
  );
}
