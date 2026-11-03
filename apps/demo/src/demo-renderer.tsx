import {
  DilRenderer,
  type RendererMetrics,
  type ProgressiveReveal,
  type DilRendererHandle,
  type AutoScroll,
  type UpdateInterval,
} from "@snackbit/opendil";
import { useCallback, type Ref } from "react";
import { primaryForeground } from "./workbench/appearance";
import { DEMO_RENDER_MODE } from "./playback/defaults";
export type RenderMode = "isolated" | "shadow" | "host";
function input(detail: { length: number }) {
  window.dispatchEvent(new CustomEvent("dil:input", { detail }));
}
function commit(detail: RendererMetrics) {
  window.dispatchEvent(new CustomEvent("dil:commit", { detail }));
}
export function DemoRenderer({
  mode = DEMO_RENDER_MODE,
  appearance = "light",
  primary = "#202020",
  radius = 12,
  buttonClass = "",
  onCommit,
  ...props
}: {
  mode?: RenderMode;
  appearance?: "light" | "dark";
  primary?: string;
  radius?: number;
  buttonClass?: string;
  onCommit?: ((detail: RendererMetrics) => void) | undefined;
  ref?: Ref<DilRendererHandle> | undefined;
  text: string;
  isStreaming?: boolean;
  progressiveReveal?: ProgressiveReveal;
  autoScroll?: AutoScroll;
  updateInterval?: UpdateInterval;
  onFollowChange?: (following: boolean) => void;
}) {
  const notify = useCallback(
    (detail: RendererMetrics) => {
      commit(detail);
      onCommit?.(detail);
    },
    [onCommit],
  );
  if (mode === "isolated")
    return (
      <DilRenderer
        {...props}
        showStatus={false}
        runtimeBaseUrl={import.meta.env.BASE_URL + "opendil/"}
        onInput={input}
        onCommit={notify}
      />
    );
  const styled = {
    ...props,
    showStatus: false,
    appearance,
    tokens: {
      "--primary": primary,
      "--primary-foreground": primaryForeground(primary),
      "--radius": radius + "px",
    },
    classNames: { button: buttonClass },
    onInput: input,
    onCommit: notify,
  };
  return <DilRenderer {...styled} mode={mode} />;
}
