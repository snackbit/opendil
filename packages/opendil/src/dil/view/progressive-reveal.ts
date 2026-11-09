import { useLayoutEffect, useMemo, type RefObject } from "react";
import type { DilDocument } from "../runtime/document";
import { PresentationHistory } from "../runtime/presentation-history";
import type { RendererViewport } from "../renderer-environment";
import { revealTiming, type ProgressiveReveal } from "./reveal-options";
import { RevealController } from "./reveal/controller";
export function revealDelay(index: number, staggerMs = 50) {
  return Math.min(index * staggerMs, staggerMs * 6);
}
/**
 * `progressiveReveal` is the host's opt-in. Blocks reveal only while the
 * renderer streams, and only from `revealFrom`, the source offset the text
 * had reached when the renderer mounted.
 */
export function useProgressiveReveal(
  root: RefObject<HTMLElement | null>,
  options: ProgressiveReveal,
  document: DilDocument | null,
  viewport: RendererViewport | undefined,
  streaming: boolean,
  revealFrom: number,
) {
  const timing = revealTiming(options);
  const stagger = timing?.staggerMs,
    duration = timing?.durationMs;
  const controller = useMemo(
    () =>
      new RevealController(
        document?.presentation ?? new PresentationHistory(),
        () => {
          if (!viewport) return { top: 0, bottom: window.innerHeight };
          // The visible area in client coordinates, which reveal targets use.
          const top = viewport.origin() + viewport.offset;
          return { top, bottom: top + viewport.height };
        },
      ),
    [document, viewport],
  );
  const configured = useMemo(
    () =>
      stagger === undefined || duration === undefined
        ? null
        : { staggerMs: stagger, durationMs: duration },
    [stagger, duration],
  );
  controller.prime(configured, streaming, revealFrom);
  useLayoutEffect(() => {
    controller.configure(configured);
  }, [controller, configured]);
  useLayoutEffect(() => {
    controller.setStreaming(streaming);
  }, [controller, streaming]);
  useLayoutEffect(() => {
    if (!root.current || !document) return;
    return controller.start();
  }, [root, document, controller]);
  return controller;
}
