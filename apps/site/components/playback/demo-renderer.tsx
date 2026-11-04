import {
  DilRenderer,
  type RendererMetrics,
  type ProgressiveReveal,
  type DilRendererHandle,
  type AutoScroll,
  type UpdateInterval,
  type DilRenderError,
} from "@snackbit/opendil";
import "@snackbit/opendil/styles.css";
import { useCallback, type Ref } from "react";
import { primaryForeground } from "@/components/workbench/appearance";
import { DEMO_RENDER_MODE } from "./defaults";
export type RenderMode = "isolated" | "shadow" | "host";
/** next.config.ts exposes the base path; Next.js does not rewrite this URL itself. */
export const runtimeBaseUrl =
  (process.env.NEXT_PUBLIC_BASE_PATH ?? "") + "/opendil/";
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
  onError?: ((error: DilRenderError) => void) | undefined;
}) {
  const notify = useCallback(
    (detail: RendererMetrics) => {
      commit(detail);
      onCommit?.(detail);
    },
    [onCommit],
  );
  const theme = {
    appearance,
    tokens: {
      "--primary": primary,
      "--primary-foreground": primaryForeground(primary),
      "--radius": radius + "px",
    },
  };
  if (mode === "isolated")
    return (
      <DilRenderer
        {...props}
        {...theme}
        showStatus={false}
        runtimeBaseUrl={runtimeBaseUrl}
        onInput={input}
        onCommit={notify}
      />
    );
  const styled = {
    ...props,
    ...theme,
    showStatus: false,
    classNames: { button: buttonClass },
    onInput: input,
    onCommit: notify,
  };
  return <DilRenderer {...styled} mode={mode} />;
}
