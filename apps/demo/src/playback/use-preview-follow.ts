import { useEffect, useRef, type RefObject } from "react";

/** Follow the landing preview's own scroll pane, retaining a manual pause until replay. */
export function usePreviewFollow(
  root: RefObject<HTMLElement | null>,
  run: number,
  streaming: boolean,
  enabled = true,
  behavior: "instant" | "smooth" = "instant",
  padding = 0,
) {
  const paused = useRef(false);
  const started = useRef(false);
  useEffect(() => {
    paused.current = false;
    started.current = false;
  }, [run]);
  useEffect(() => {
    const element = root.current;
    if (!element || !enabled) return;
    if (streaming) started.current = true;
    let frame = 0;
    const update = () => {
      if (frame || paused.current || !started.current) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        element.scrollTo({ top: element.scrollHeight + padding, behavior });
      });
    };
    const pause = () => {
      paused.current = true;
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const pointer = (event: PointerEvent) => {
      if (
        event.target === element &&
        event.clientX >= element.getBoundingClientRect().right - 16
      )
        pause();
    };
    const key = (event: KeyboardEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(
          'input, textarea, button, [role="slider"], [role="radio"]',
        )
      )
        return;
      if (
        [
          "PageUp",
          "PageDown",
          "Home",
          "End",
          "ArrowUp",
          "ArrowDown",
          " ",
        ].includes(event.key)
      )
        pause();
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    element.addEventListener("wheel", pause, { passive: true });
    element.addEventListener("touchmove", pause, { passive: true });
    element.addEventListener("pointerdown", pointer);
    element.addEventListener("keydown", key);
    update();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      element.removeEventListener("wheel", pause);
      element.removeEventListener("touchmove", pause);
      element.removeEventListener("pointerdown", pointer);
      element.removeEventListener("keydown", key);
    };
  }, [root, run, streaming, enabled, behavior, padding]);
}
