import { useLayoutEffect, useState, type RefObject } from "react";
import {
  chosenScroller,
  namesScroller,
  readScrollContainer,
  type ScrollContainer,
} from "../scroll-options";
import {
  encloses,
  findScrollContainer,
  listenForScroll,
  ScrollRoot,
} from "./scroll-root";

/** Keeps track of the scroller around one renderer and announces when it changes. */
export class ScrollRootTracker {
  private root: ScrollRoot | null = null;
  private readonly listeners = new Set<() => void>();
  /** The tracked scroller, or null before the renderer is attached. */
  get current() {
    return this.root;
  }
  /** The tracked scroller, or the window of `element` before tracking starts. */
  rootFor(element: Element) {
    const view = element.ownerDocument.defaultView;
    if (this.root || !view) return this.root;
    return new ScrollRoot(view, null);
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  /** Follows `target`'s scroller until the returned cleanup runs. */
  attach(target: HTMLElement, container: ScrollContainer) {
    const view = target.ownerDocument.defaultView;
    if (!view) return () => {};
    const resolve = () => {
      const chosen = chosenScroller(container);
      const element =
        chosen === undefined ? findScrollContainer(target) : chosen;
      if (this.root?.element === element) return;
      this.root = new ScrollRoot(view, element);
      this.listeners.forEach((listener) => listener());
    };
    resolve();
    // A named element or the window never changes; detection and refs do.
    if (namesScroller(container))
      return () => {
        this.root = null;
      };
    let attached = true;
    // An ancestor's ref is attached after this renderer's layout effects, so
    // read it again once the commit is done and before any frame paints.
    queueMicrotask(() => {
      if (attached) resolve();
    });
    const observer = new ResizeObserver(resolve);
    observer.observe(target);
    // Scrolling an ancestor proves it scrolls, even when this renderer did not resize.
    const unlisten = listenForScroll(target, (event) => {
      const source = event.target;
      if (
        source instanceof view.Element &&
        source !== this.root?.element &&
        encloses(source, target)
      )
        resolve();
    });
    view.addEventListener("resize", resolve);
    return () => {
      attached = false;
      observer.disconnect();
      unlisten();
      view.removeEventListener("resize", resolve);
      this.root = null;
    };
  }
}
/** The scroller around `target`; `enabled` is false where an outer frame owns scrolling. */
export function useScrollRoot(
  target: RefObject<HTMLElement | null>,
  option: unknown,
  enabled = true,
) {
  const container = readScrollContainer(option);
  const [tracker] = useState(() => new ScrollRootTracker());
  useLayoutEffect(() => {
    const element = target.current;
    if (!enabled || !element) return;
    return tracker.attach(element, container);
  }, [tracker, target, container, enabled]);
  return tracker;
}
