import { useMemo, useState } from "react";
import type { UpdateInterval } from "@snackbit/opendil";
import type { RenderMode } from "./demo-renderer";
import { DEMO_RENDER_MODE, DEMO_REVEAL } from "./defaults";

export function useDemoOptions() {
  const [enabled, onEnabled] = useState(true);
  const [staggerMs, onStagger] = useState<number>(DEMO_REVEAL.staggerMs);
  const [durationMs, onDuration] = useState<number>(DEMO_REVEAL.durationMs);
  const [mode, onMode] = useState<RenderMode>(DEMO_RENDER_MODE);
  const [autoScroll, onAutoScroll] = useState(true);
  const [scrollBehavior, onScrollBehavior] = useState<"instant" | "smooth">(
    "instant",
  );
  const [scrollPadding, onScrollPadding] = useState(0);
  const [updateInterval, onUpdateInterval] =
    useState<UpdateInterval>("instant");
  const reveal = useMemo(
    () => (enabled ? { staggerMs, durationMs } : false),
    [enabled, staggerMs, durationMs],
  );
  const scrolling = useMemo(
    () =>
      autoScroll ? { behavior: scrollBehavior, padding: scrollPadding } : false,
    [autoScroll, scrollBehavior, scrollPadding],
  );
  return {
    enabled,
    onEnabled,
    staggerMs,
    onStagger,
    durationMs,
    onDuration,
    mode,
    onMode,
    autoScroll,
    onAutoScroll,
    scrollBehavior,
    onScrollBehavior,
    scrollPadding,
    onScrollPadding,
    updateInterval,
    onUpdateInterval,
    reveal,
    scrolling,
  };
}
