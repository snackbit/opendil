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
  constructor(
    private readonly target: () => HTMLElement | null,
    private readonly roots: ScrollRootTracker,
  ) {}
  private measure() {
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
    this.stop ??= this.observe();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size) return;
      this.stop?.();
      this.stop = undefined;
    };
  }
  private notify = (force = false) => {
    const { offset, height, width } = this.measure();
    const key = offset + ":" + height + ":" + width;
    if (!force && key === this.last) return;
    this.last = key;
    this.listeners.forEach((listener) => listener());
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
