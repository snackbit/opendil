"use client";
import { useMemo, type Ref } from "react";
import type { DilRendererHandle } from "./renderer-handle";
import {
  CustomizationContext,
  DiagramOpenContext,
  type DilCustomization,
} from "./customization";
import { MessageRenderer } from "./message-renderer";
import { useLatestCallback, useStableRecord } from "./stable-record";
import { ShadowRenderer } from "./isolation/shadow-renderer";
import {
  RendererEnvironmentContext,
  type RendererMetrics,
} from "./renderer-environment";
import type { DilRenderError } from "./render-error";
import type { DilSnapshot } from "./document-cache";
import { UiScope } from "../components/ui/overlays/ui-scope";
import { resolveUiPrimitives, UiPrimitivesContext } from "./ui-primitives";
import type { ProgressiveReveal } from "./view/reveal-options";
import type { AutoScroll, ScrollContainer } from "./view/scroll-options";
import type { UpdateInterval } from "./runtime/presentation-scheduler";
import type { Appearance, ThemeTokens } from "./isolation/frame-theme";

type Optional<T> = { [Key in keyof T]?: T[Key] | undefined };
export interface StyledRendererProps extends Optional<DilCustomization> {
  mode: "host" | "shadow";
  rendererRef?: Ref<DilRendererHandle> | undefined;
  text: string;
  isStreaming: boolean;
  showStatus: boolean;
  progressiveReveal: ProgressiveReveal;
  autoScroll: AutoScroll;
  scrollContainer?: ScrollContainer | undefined;
  updateInterval: UpdateInterval;
  onFollowChange?: ((following: boolean) => void) | undefined;
  onInput?: ((detail: { length: number }) => void) | undefined;
  onCommit?: ((detail: RendererMetrics) => void) | undefined;
  onSettled?: (() => void) | undefined;
  onError?: ((error: DilRenderError) => void) | undefined;
  cacheKey?: string | undefined;
  snapshot?: DilSnapshot | undefined;
  onSnapshot?: ((snapshot: DilSnapshot) => void) | undefined;
  className?: string | undefined;
  theme: "stock" | "inherit";
  appearance: Appearance;
  tokens?: ThemeTokens | undefined;
  shadowStyles?: string | undefined;
}

/**
 * Host and Shadow DOM rendering run the parser and QuickJS workers in the page,
 * so this module and its embedded workers load only when a page uses those modes.
 */
export { warmExpressionRuntime } from "./runtime/expressions";
export { clearDocumentCache } from "./document-cache";
export function StyledRenderer(props: StyledRendererProps) {
  const { onInput, onCommit, onSettled, onError } = props;
  // Inline literals from the host keep their earlier identity while their
  // content is unchanged, so contexts change only with real customization.
  const components = useStableRecord(props.components);
  const componentConfig = useStableRecord(props.componentConfig);
  const classNames = useStableRecord(props.classNames);
  const slots = useStableRecord(props.slots);
  const markdownComponents = useStableRecord(props.markdownComponents);
  const diagnostics = useStableRecord(props.diagnostics);
  const uiPrimitives = useStableRecord(props.uiPrimitives);
  const tokens = useStableRecord(props.tokens);
  const openDiagram = useLatestCallback(props.onOpenDiagram);
  const primitives = useMemo(
    () => resolveUiPrimitives(uiPrimitives),
    [uiPrimitives],
  );
  const environment = useMemo(
    () => ({
      ...(onInput ? { onInput } : {}),
      ...(onCommit ? { onCommit } : {}),
      ...(onSettled ? { onSettled } : {}),
      ...(onError ? { onError } : {}),
    }),
    [onInput, onCommit, onSettled, onError],
  );
  const customization = useMemo(
    () => ({
      ...(components ? { components } : {}),
      ...(componentConfig ? { componentConfig } : {}),
      ...(classNames ? { classNames } : {}),
      ...(slots ? { slots } : {}),
      ...(markdownComponents ? { markdownComponents } : {}),
      ...(diagnostics ? { diagnostics } : {}),
    }),
    [
      components,
      componentConfig,
      classNames,
      slots,
      markdownComponents,
      diagnostics,
    ],
  );
  const content = (
    <UiScope
      {...(props.className ? { className: props.className } : {})}
      appearance={props.appearance}
      theme={props.theme}
      {...(tokens ? { tokens } : {})}
    >
      <MessageRenderer
        updateInterval={props.updateInterval}
        text={props.text}
        isStreaming={props.isStreaming}
        showStatus={props.showStatus}
        progressiveReveal={props.progressiveReveal}
        autoScroll={props.autoScroll}
        scrollContainer={props.scrollContainer}
        onFollowChange={props.onFollowChange}
        rendererRef={props.rendererRef}
        cacheKey={props.cacheKey}
        snapshot={props.snapshot}
        onSnapshot={props.onSnapshot}
      />
    </UiScope>
  );
  return (
    <RendererEnvironmentContext.Provider value={environment}>
      <CustomizationContext.Provider value={customization}>
        <UiPrimitivesContext.Provider value={primitives}>
          <DiagramOpenContext.Provider value={openDiagram}>
            {props.mode === "shadow" ? (
              <ShadowRenderer shadowStyles={props.shadowStyles}>
                {content}
              </ShadowRenderer>
            ) : (
              <div data-dil-mode="host">{content}</div>
            )}
          </DiagramOpenContext.Provider>
        </UiPrimitivesContext.Provider>
      </CustomizationContext.Provider>
    </RendererEnvironmentContext.Provider>
  );
}
