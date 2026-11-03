import type { scrollSettings } from "../scroll-options";
type Settings = ReturnType<typeof scrollSettings>;
const anchors = new WeakMap<
  HTMLElement,
  { owners: number; original: string }
>();
function suspendAnchoring(document: Document) {
  const element = document.documentElement;
  let lease = anchors.get(element);
  if (!lease) {
    lease = { owners: 0, original: element.style.overflowAnchor };
    anchors.set(element, lease);
    element.style.overflowAnchor = "none";
  }
  lease.owners++;
  const owned = lease;
  return () => {
    if (--owned.owners === 0) {
      element.style.overflowAnchor = owned.original;
      anchors.delete(element);
    }
  };
}
/** One moving-target animation per message. Native smooth scrolling would restart on each chunk. */
export class ScrollFollower {
  private readonly view: Window;
  private readonly reduced: MediaQueryList;
  private readonly observer: ResizeObserver;
  private readonly unlisten: () => void;
  private releaseAnchor: (() => void) | undefined;
  private frame = 0;
  private previous = 0;
  private position: number | undefined;
  private following = false;
  private notified = false;
  constructor(
    private readonly element: HTMLElement,
    private readonly settings: () => Settings,
    private readonly changed: (following: boolean) => void,
    listen: (view: Window, pause: () => void) => () => void,
  ) {
    const view = element.ownerDocument.defaultView;
    if (!view) throw new Error("Following requires a browser document.");
    this.view = view;
    this.reduced = view.matchMedia("(prefers-reduced-motion: reduce)");
    this.reduced.addEventListener("change", this.refresh);
    this.observer = new ResizeObserver(this.refresh);
    this.observer.observe(element);
    this.unlisten = listen(view, this.pause);
  }
  private report(value: boolean) {
    if (this.following === value && this.notified) return;
    this.following = value;
    this.notified = true;
    this.changed(value);
  }
  start() {
    this.resume();
  }
  end() {
    if (this.following) this.refresh();
    else this.report(false);
  }
  resume = () => {
    if (!this.element.isConnected) return;
    this.position = this.view.scrollY;
    this.releaseAnchor ??= suspendAnchoring(this.element.ownerDocument);
    this.report(true);
    this.refresh();
  };
  pause = () => {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.position = undefined;
    this.releaseAnchor?.();
    this.releaseAnchor = undefined;
    this.report(false);
  };
  refresh = () => {
    if (!this.following || this.frame) return;
    this.previous = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  };
  private tick = (now: number) => {
    this.frame = 0;
    const settings = this.settings();
    if (!this.following || !settings || !this.element.isConnected) {
      this.pause();
      return;
    }
    const view = this.view,
      document = this.element.ownerDocument;
    const maximum = Math.max(
      0,
      (document.scrollingElement ?? document.documentElement).scrollHeight -
        view.innerHeight,
    );
    const target = Math.max(
      0,
      Math.min(
        maximum,
        view.scrollY +
          this.element.getBoundingClientRect().bottom -
          view.innerHeight +
          settings.padding,
      ),
    );
    const actual = view.scrollY;
    if (this.position === undefined || Math.abs(actual - this.position) > 1.5)
      this.position = actual;
    const smooth = settings.behavior === "smooth" && !this.reduced.matches;
    const elapsed = Math.min(64, Math.max(0, now - this.previous));
    this.previous = now;
    this.position = smooth
      ? target + (this.position - target) * Math.exp(-elapsed / 80)
      : target;
    if (Math.abs(target - this.position) < 0.5) this.position = target;
    // Keep fractional progress internally: browsers can round scroll offsets to whole pixels.
    view.scrollTo({ top: this.position, behavior: "instant" });
    const settled =
      Math.abs(target - this.position) < 0.5 &&
      Math.abs(target - view.scrollY) <= 1;
    // Stop animation work once settled, but keep observing late chart and expression layout.
    // Only a reading gesture, an explicit pause, or disposal releases following.
    if (!settled) this.frame = requestAnimationFrame(this.tick);
  };
  dispose() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.releaseAnchor?.();
    this.releaseAnchor = undefined;
    this.observer.disconnect();
    this.unlisten();
    this.reduced.removeEventListener("change", this.refresh);
  }
}
