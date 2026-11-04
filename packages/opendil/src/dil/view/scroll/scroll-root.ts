/** Visible part of a scrolling viewport, in client coordinates. */
export interface ScrollBounds {
  top: number;
  bottom: number;
  width: number;
}
/** The window or element whose scrolling moves a renderer. */
export class ScrollRoot {
  constructor(
    readonly view: Window,
    /** The scrolling element, or null when the window scrolls. */
    readonly element: HTMLElement | null,
  ) {}
  get top() {
    return this.element ? this.element.scrollTop : this.view.scrollY;
  }
  get maximum() {
    const element =
      this.element ??
      this.view.document.scrollingElement ??
      this.view.document.documentElement;
    const visible = this.element
      ? this.element.clientHeight
      : this.view.innerHeight;
    return Math.max(0, element.scrollHeight - visible);
  }
  /** The scroller's visible area, clipped to the window when it extends beyond it. */
  bounds(): ScrollBounds {
    const height = this.view.innerHeight;
    if (!this.element)
      return {
        top: 0,
        bottom: height,
        width: this.view.document.documentElement.clientWidth,
      };
    const box = this.element.getBoundingClientRect();
    const top = box.top + this.element.clientTop;
    const bottom = top + this.element.clientHeight;
    // A scroller that is entirely off-screen keeps its own geometry.
    const visible = top < height && bottom > 0;
    return {
      top: visible ? Math.max(0, top) : top,
      bottom: visible ? Math.min(height, bottom) : bottom,
      width: this.element.clientWidth,
    };
  }
  scrollTo(top: number) {
    (this.element ?? this.view).scrollTo({ top, behavior: "instant" });
  }
  /** The element whose `overflow-anchor` governs this scroller. */
  get anchor() {
    return this.element ?? this.view.document.documentElement;
  }
  /** Whether an event happened inside this scroller. The window contains every event. */
  contains(event: Event) {
    return !this.element || event.composedPath().includes(this.element);
  }
  /** Whether a pointer event pressed this scroller's own vertical scrollbar. */
  scrollbar(event: PointerEvent) {
    if (!this.element)
      return event.clientX >= this.view.document.documentElement.clientWidth;
    if ((event.composedPath()[0] ?? event.target) !== this.element)
      return false;
    const box = this.element.getBoundingClientRect();
    return (
      event.clientX >=
      box.left + this.element.clientLeft + this.element.clientWidth
    );
  }
}
/** The parent in the flat tree: slots, then light DOM parents, then Shadow DOM hosts. */
function parentOf(element: Element): Element | null {
  if (element.assignedSlot) return element.assignedSlot;
  if (element.parentElement) return element.parentElement;
  const parent = element.parentNode;
  return parent && "host" in parent && parent.host instanceof Element
    ? parent.host
    : null;
}
/**
 * Overflow that does not count as scrolling. `overflow-x: auto` alone also
 * computes `overflow-y` to auto, and such a wrapper can overflow by a pixel or
 * two (a relatively positioned child, rounding); `overflow-y: scroll` keeps a
 * scrollbar even with nothing to scroll. Neither should take following away
 * from the page.
 */
const MINIMUM_RANGE = 8;
/** Whether the reader can scroll this element vertically now. */
function scrolls(element: Element) {
  const { overflowY } = getComputedStyle(element);
  return (
    (overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay") &&
    element.scrollHeight - element.clientHeight > MINIMUM_RANGE
  );
}
/** The nearest ancestor that scrolls, across Shadow DOM boundaries, or null for the window. */
export function findScrollContainer(start: Element): HTMLElement | null {
  const document = start.ownerDocument;
  // The body passes its overflow to the viewport unless the root element clips
  // its own; then the body is an ordinary scroller (app shells with body scroll).
  const page =
    getComputedStyle(document.documentElement).overflowY === "visible"
      ? document.body
      : null;
  for (
    let element = parentOf(start);
    element && element !== page && element !== document.documentElement;
    element = parentOf(element)
  )
    if (element instanceof HTMLElement && scrolls(element)) return element;
  return null;
}
/**
 * Calls `listener` in the capture phase for scroll events that can move
 * `target`. Scroll events do not cross Shadow DOM boundaries, so besides the
 * document this listens on every shadow root around `target`.
 */
export function listenForScroll(
  target: Element,
  listener: (event: Event) => void,
) {
  const scopes = new Set<EventTarget>([target.ownerDocument]);
  for (let element = parentOf(target); element; element = parentOf(element)) {
    const scope = element.getRootNode();
    if (scope.nodeType === Node.DOCUMENT_FRAGMENT_NODE) scopes.add(scope);
  }
  const options = { capture: true, passive: true };
  scopes.forEach((scope) =>
    scope.addEventListener("scroll", listener, options),
  );
  return () =>
    scopes.forEach((scope) =>
      scope.removeEventListener("scroll", listener, options),
    );
}
/** Whether `node` is `element` or one of its flat-tree ancestors. */
export function encloses(node: Node, element: Element) {
  for (
    let current: Element | null = element;
    current;
    current = parentOf(current)
  )
    if (current === node) return true;
  return false;
}
