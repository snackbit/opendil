import { useCallback, useEffect, useRef, useMemo, type RefObject } from "react";
import { scrollSettings, type AutoScroll } from "./scroll-options";
import { ScrollFollower } from "./scroll/controller";
import type { ScrollRootTracker } from "./scroll/root-tracker";
import { ScrollRoot } from "./scroll/scroll-root";

function editingTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !!target.closest(
      'input, textarea, select, [contenteditable="true"], [role="slider"], [role="radio"]',
    )
  );
}
/**
 * Pauses on reading gestures inside the scroller that `scope` returns. With a
 * scroll container, gestures elsewhere on the page, such as wheeling a
 * sidebar, leave following alone.
 */
export function listenForScrollAway(
  view: Window,
  pause: () => void,
  scope?: () => ScrollRoot,
) {
  const page = new ScrollRoot(view, null);
  const current = scope ?? (() => page);
  let touchY: number | undefined;
  let touchX: number | undefined;
  let touching = false;
  const wheel = (event: WheelEvent) => {
    if (current().contains(event)) pause();
  };
  const key = (event: KeyboardEvent) => {
    const target = event.composedPath()[0] ?? event.target;
    // Unfocused pages scroll the scroller the reader last used.
    const unfocused =
      target === view.document.body ||
      target === view.document.documentElement ||
      target === view.document ||
      target === view;
    if (
      !event.defaultPrevented &&
      (unfocused || current().contains(event)) &&
      !editingTarget(target) &&
      ([
        "PageUp",
        "PageDown",
        "Home",
        "End",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ].includes(event.key) ||
        (event.key === " " &&
          !(
            target instanceof Element &&
            target.closest("button, [role=button], [role=tab]")
          )))
    )
      pause();
  };
  const start = (event: TouchEvent) => {
    touching = current().contains(event);
    touchY = event.touches[0]?.clientY;
    touchX = event.touches[0]?.clientX;
  };
  const move = (event: TouchEvent) => {
    if (!touching) return;
    const next = event.touches[0]?.clientY;
    const nextX = event.touches[0]?.clientX;
    if (nextX !== undefined && touchX !== undefined && nextX !== touchX)
      pause();
    touchX = nextX;
    if (next !== undefined && touchY !== undefined && next !== touchY) pause();
    touchY = next;
  };
  const pointer = (event: PointerEvent) => {
    const target = event.composedPath()[0] ?? event.target;
    const root = current();
    if (
      root.scrollbar(event) ||
      (root.contains(event) &&
        (event.button === 1 ||
          (target instanceof Element && target.closest("a[href]"))))
    )
      pause();
  };
  view.addEventListener("wheel", wheel, { passive: true });
  view.addEventListener("keydown", key);
  view.addEventListener("touchstart", start, { passive: true });
  view.addEventListener("touchmove", move, { passive: true });
  view.addEventListener("pointerdown", pointer);
  return () => {
    view.removeEventListener("wheel", wheel);
    view.removeEventListener("keydown", key);
    view.removeEventListener("touchstart", start);
    view.removeEventListener("touchmove", move);
    view.removeEventListener("pointerdown", pointer);
  };
}
/** Only deliberate reading gestures suspend following, never layout or anchor adjustments. */
export function useStreamFollow(
  root: RefObject<HTMLElement | null>,
  options: AutoScroll,
  streaming: boolean,
  onChange?: ((following: boolean) => void) | undefined,
  scroller?: ScrollRootTracker,
) {
  const settings = scrollSettings(options);
  const enabled = settings !== null;
  const settingsRef = useRef(settings);
  const follower = useRef<ScrollFollower | null>(null);
  const behavior = settings?.behavior,
    padding = settings?.padding;
  useEffect(() => {
    settingsRef.current =
      behavior === undefined || padding === undefined
        ? null
        : { behavior, padding };
    follower.current?.refresh();
  }, [behavior, padding]);
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);
  const pause = useCallback(() => follower.current?.pause(), []);
  const resume = useCallback(() => follower.current?.resume(), []);
  useEffect(() => {
    const element = root.current;
    if (!enabled || !element) {
      callback.current?.(false);
      return;
    }
    const controller = new ScrollFollower(
      element,
      () => settingsRef.current,
      (value) => callback.current?.(value),
      listenForScrollAway,
      scroller,
    );
    follower.current = controller;
    return () => {
      controller.dispose();
      follower.current = null;
    };
  }, [root, enabled, scroller]);
  useEffect(() => {
    if (streaming) follower.current?.start();
    else follower.current?.end();
  }, [streaming, enabled]);
  return useMemo(() => ({ pause, resume }), [pause, resume]);
}
