import type { RefObject } from "react";
export interface AutoScrollOptions {
  behavior?: "instant" | "smooth";
  /** Extra distance beyond the message tail, clamped to available document space. */
  padding?: number;
}
export type AutoScroll = boolean | AutoScrollOptions;
/**
 * What scrolls the conversation around a renderer. `"auto"` uses the nearest
 * ancestor that scrolls vertically, crossing Shadow DOM boundaries, and the
 * window when none does; it re-checks when layout changes. `"window"` always
 * uses the page. An element, or a ref to one, names the scroller directly; a
 * ref that is still empty, or `null`, behaves like `"auto"`.
 */
export type ScrollContainer =
  "auto" | "window" | HTMLElement | RefObject<HTMLElement | null> | null;
export function scrollSettings(value: AutoScroll) {
  if (value === false) return null;
  const behavior = value === true ? "instant" : (value.behavior ?? "instant");
  const padding = value === true ? 0 : (value.padding ?? 0);
  if (behavior !== "instant" && behavior !== "smooth")
    throw new Error("Auto-scroll behavior must be instant or smooth.");
  if (!Number.isFinite(padding) || padding < 0)
    throw new Error("Auto-scroll padding must be a finite nonnegative number.");
  return { behavior, padding };
}
function isElement(value: unknown): value is HTMLElement {
  // Elements from another frame fail instanceof checks; their node type does not.
  return (
    typeof value === "object" &&
    value !== null &&
    "nodeType" in value &&
    value.nodeType === 1
  );
}
/** Checks the option at the API boundary; untyped callers can pass anything. */
export function readScrollContainer(value: unknown): ScrollContainer {
  if (value === undefined || value === null || value === "auto") return "auto";
  if (value === "window" || isElement(value)) return value;
  // Refs are read whenever the scroller is checked; see `ScrollRootTracker`.
  if (typeof value === "object" && "current" in value)
    return value as RefObject<HTMLElement | null>;
  throw new Error(
    'scrollContainer must be "auto", "window", an element, or a ref to an element.',
  );
}
/** Whether the option fixes the scroller for good: the window or an element, not a ref. */
export function namesScroller(value: ScrollContainer) {
  return value === "window" || isElement(value);
}
/** The element the option names right now, `null` for the window, or undefined to detect it. */
export function chosenScroller(
  value: ScrollContainer,
): HTMLElement | null | undefined {
  if (value === "window") return null;
  if (value === "auto" || value === null) return undefined;
  if (isElement(value)) return value;
  return isElement(value.current) ? value.current : undefined;
}
