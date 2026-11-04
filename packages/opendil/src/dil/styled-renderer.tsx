"use client";
import { useMemo, type Ref } from "react";
import type { DilRendererHandle } from "./renderer-handle";
import { CustomizationContext, type DilCustomization } from "./customization";
import { MessageRenderer } from "./message-renderer";
import { ShadowRenderer } from "./isolation/shadow-renderer";
import {
  RendererEnvironmentContext,
  type RendererMetrics,
} from "./renderer-environment";
import type { DilRenderError } from "./render-error";
import { UiScope } from "../components/ui/overlays/ui-scope";
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
  onError?: ((error: DilRenderError) => void) | undefined;
  className?: string | undefined;
  appearance: Appearance;
  tokens?: ThemeTokens | undefined;
  shadowStyles?: string | undefined;
}

/**
 * Host and Shadow DOM rendering run the parser and QuickJS workers in the page,
 * so this module and its embedded workers load only when a page uses those modes.
 */
export function StyledRenderer(props: StyledRendererProps) {
  const {
    onInput,
    onCommit,
    onError,
    components,
    componentConfig,
    classNames,
    slots,
  } = props;
  const environment = useMemo(
    () => ({
      ...(onInput ? { onInput } : {}),
      ...(onCommit ? { onCommit } : {}),
      ...(onError ? { onError } : {}),
    }),
    [onInput, onCommit, onError],
  );
  const customization = useMemo(
    () => ({
      ...(components ? { components } : {}),
      ...(componentConfig ? { componentConfig } : {}),
      ...(classNames ? { classNames } : {}),
      ...(slots ? { slots } : {}),
    }),
    [components, componentConfig, classNames, slots],
  );
  const content = (
    <UiScope
      {...(props.className ? { className: props.className } : {})}
      appearance={props.appearance}
      {...(props.tokens ? { tokens: props.tokens } : {})}
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
      />
    </UiScope>
  );
  return (
    <RendererEnvironmentContext.Provider value={environment}>
      <CustomizationContext.Provider value={customization}>
        {props.mode === "shadow" ? (
          <ShadowRenderer shadowStyles={props.shadowStyles}>
            {content}
          </ShadowRenderer>
        ) : (
          <div data-dil-mode="host">{content}</div>
        )}
      </CustomizationContext.Provider>
    </RendererEnvironmentContext.Provider>
  );
}
