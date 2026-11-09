import type { RendererViewport } from "../../renderer-environment";
import type { ScrollRootTracker } from "./root-tracker";
import { encloses, listenForScroll } from "./scroll-root";

/**
 * The visible area of a host or Shadow DOM renderer, measured from the
 * renderer's top like the iframe runtime's frame viewport, so that layout
 * outside the renderer never shifts virtualized positions.
 */
export class HostViewport implements RendererViewport {
  private readonly listeners = new Set<() => void>();
  private stop: (() => void) | undefined;
  private last = "";
  /** The measurement listeners read while a notification runs. */
  private current: ReturnType<HostViewport["read"]> | undefined;
  constructor(
    private readonly target: () => HTMLElement | null,
    private readonly roots: ScrollRootTracker,
  ) {}
  private measure() {
    return this.current ?? this.read();
  }
  private read() {
    const element = this.target();
    const root = element && this.roots.rootFor(element);
    if (!element || !root) return { origin: 0, offset: 0, height: 0, width: 0 };
    const box = element.getBoundingClientRect(),
      bounds = root.bounds();
    // Offsets are negative while the renderer starts below the visible top.
    return {
      origin: box.top,
      offset: bounds.top - box.top,
      height: Math.max(0, bounds.bottom - bounds.top),
      width: box.width,
    };
  }
  get offset() {
    return this.measure().offset;
  }
  get height() {
    return this.measure().height;
  }
  get width() {
    return this.measure().width;
  }
  origin() {
    return this.measure().origin;
  }
  scrollTo(offset: number) {
    const element = this.target();
    const root = element && this.roots.rootFor(element);
    if (!element || !root) return;
    root.scrollTo(
      root.top +
        element.getBoundingClientRect().top +
        offset -
        root.bounds().top,
    );
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    if (this.target()) this.stop ??= this.observe();
    // Content that renders in the renderer's first commit, such as a complete
    // document, subscribes before the renderer's own ref is attached, which
    // happens later in that commit.
    else
      queueMicrotask(() => {
        if (this.listeners.size && this.target()) this.stop ??= this.observe();
      });
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size) return;
      this.stop?.();
      this.stop = undefined;
    };
  }
  private notify = (force = false) => {
    const measured = this.read();
    const { offset, height, width } = measured;
    const key = offset + ":" + height + ":" + width;
    if (!force && key === this.last) return;
    this.last = key;
    // Listeners read offset, height, width and origin: one layout read serves them all.
    this.current = measured;
    try {
      this.listeners.forEach((listener) => listener());
    } finally {
      this.current = undefined;
    }
  };
  private observe() {
    const element = this.target();
    const view = element?.ownerDocument.defaultView;
    if (!element || !view) return () => {};
    const resized = () => this.notify(true);
    const observer = new ResizeObserver(resized);
    observer.observe(element);
    let observed: HTMLElement | null = null;
    const rebind = () => {
      if (observed) observer.unobserve(observed);
      observed = this.roots.current?.element ?? null;
      if (observed) observer.observe(observed);
      this.notify(true);
    };
    rebind();
    const unsubscribe = this.roots.subscribe(rebind);
    // The page and any scrolling ancestor move this renderer.
    const unlisten = listenForScroll(element, (event) => {
      const source = event.target;
      if (!(source instanceof view.Element) || encloses(source, element))
        this.notify();
    });
    const changed = () => this.notify();
    view.addEventListener("resize", changed);
    return () => {
      unsubscribe();
      observer.disconnect();
      unlisten();
      view.removeEventListener("resize", changed);
    };
  }
}
