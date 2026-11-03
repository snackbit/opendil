import { useLayoutEffect, useMemo, type RefObject } from "react";
import type { DilDocument } from "../runtime/document";
import { PresentationHistory } from "../runtime/presentation-history";
import { useRendererEnvironment } from "../renderer-environment";
import { revealTiming, type ProgressiveReveal } from "./reveal-options";
import { RevealController } from "./reveal/controller";
export function revealDelay(index: number, staggerMs = 50) {
  return Math.min(index * staggerMs, staggerMs * 6);
}
export function useProgressiveReveal(
  root: RefObject<HTMLElement | null>,
  options: ProgressiveReveal,
  document: DilDocument | null,
) {
  const { viewport } = useRendererEnvironment();
  const timing = revealTiming(options);
  const stagger = timing?.staggerMs,
    duration = timing?.durationMs;
  const controller = useMemo(
    () =>
      new RevealController(
        document?.presentation ?? new PresentationHistory(),
        () =>
          viewport
            ? {
                top: viewport.offset,
                bottom: viewport.offset + viewport.height,
              }
            : { top: 0, bottom: window.innerHeight },
      ),
    [document, viewport],
  );
  useLayoutEffect(() => {
    controller.configure(
      stagger === undefined || duration === undefined
        ? null
        : { staggerMs: stagger, durationMs: duration },
    );
  }, [controller, stagger, duration]);
  useLayoutEffect(() => {
    if (!root.current || !document) return;
    return controller.start();
  }, [root, document, controller]);
  return controller;
}
