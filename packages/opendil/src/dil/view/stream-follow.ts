import { useCallback, useEffect, useRef, useMemo, type RefObject } from "react";
import { scrollSettings, type AutoScroll } from "./scroll-options";
import { ScrollFollower } from "./scroll/controller";

function editingTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !!target.closest(
      'input, textarea, select, [contenteditable="true"], [role="slider"], [role="radio"]',
    )
  );
}
export function listenForScrollAway(view: Window, pause: () => void) {
  let touchY: number | undefined;
  let touchX: number | undefined;
  const wheel = () => {
    pause();
  };
  const key = (event: KeyboardEvent) => {
    const target = event.composedPath()[0] ?? event.target;
    if (
      !event.defaultPrevented &&
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
    touchY = event.touches[0]?.clientY;
    touchX = event.touches[0]?.clientX;
  };
  const move = (event: TouchEvent) => {
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
    if (
      event.button === 1 ||
      event.clientX >= view.document.documentElement.clientWidth ||
      (target instanceof Element && target.closest("a[href]"))
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
    );
    follower.current = controller;
    return () => {
      controller.dispose();
      follower.current = null;
    };
  }, [root, enabled]);
  useEffect(() => {
    if (streaming) follower.current?.start();
    else follower.current?.end();
  }, [streaming, enabled]);
  return useMemo(() => ({ pause, resume }), [pause, resume]);
}
