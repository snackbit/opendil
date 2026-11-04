import type { scrollSettings } from "../scroll-options";
import type { ScrollRootTracker } from "./root-tracker";
import { ScrollRoot } from "./scroll-root";
type Settings = ReturnType<typeof scrollSettings>;
/** Listens for reading gestures inside the scroller that `scope` returns (null: the page). */
export type GestureListener = (
  view: Window,
  pause: () => void,
  scope: () => ScrollRoot,
) => () => void;
const anchors = new WeakMap<
  HTMLElement,
  { owners: number; original: string }
>();
function suspendAnchoring(element: HTMLElement) {
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
  private readonly page: ScrollRoot;
  private readonly reduced: MediaQueryList;
  private readonly observer: ResizeObserver;
  private readonly unlisten: () => void;
  private readonly unsubscribe: () => void;
  private releaseAnchor: (() => void) | undefined;
  private observed: HTMLElement | null = null;
  private frame = 0;
  private previous = 0;
  private position: number | undefined;
  private following = false;
  private notified = false;
  private ended = false;
  /** How far the last tick left the view from the message's end. */
  private gap = 0;
  constructor(
    private readonly element: HTMLElement,
    private readonly settings: () => Settings,
    private readonly changed: (following: boolean) => void,
    listen: GestureListener,
    private readonly roots?: ScrollRootTracker,
  ) {
    const view = element.ownerDocument.defaultView;
    if (!view) throw new Error("Following requires a browser document.");
    this.view = view;
    this.page = new ScrollRoot(view, null);
    this.reduced = view.matchMedia("(prefers-reduced-motion: reduce)");
    this.reduced.addEventListener("change", this.refresh);
    this.observer = new ResizeObserver(this.refresh);
    this.observer.observe(element);
    this.unsubscribe = roots?.subscribe(this.rebind) ?? (() => {});
    this.rebind();
    this.unlisten = listen(view, this.pause, () => this.root);
  }
  private get root() {
    return this.roots?.current ?? this.page;
  }
  /** Moves anchoring and size observation to the current scroller. */
  private rebind = () => {
    const element = this.root.element;
    if (this.observed !== element) {
      if (this.observed) this.observer.unobserve(this.observed);
      // The scroller's own size sets how much of the message fits.
      if (element) this.observer.observe(element);
      this.observed = element;
    }
    if (this.releaseAnchor) {
      this.releaseAnchor();
      this.releaseAnchor = suspendAnchoring(this.root.anchor);
      this.position = undefined;
    }
    this.refresh();
  };
  private report(value: boolean) {
    if (this.following === value && this.notified) return;
    this.following = value;
    this.notified = true;
    this.changed(value);
  }
  start() {
    this.ended = false;
    this.resume();
  }
  end() {
    this.ended = true;
    if (this.following) this.refresh();
    else this.report(false);
  }
  resume = () => {
    if (!this.element.isConnected) return;
    this.position = this.root.top;
    this.releaseAnchor ??= suspendAnchoring(this.root.anchor);
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
    const root = this.root;
    const actual = root.top;
    const target = Math.max(
      0,
      Math.min(
        root.maximum,
        actual +
          this.element.getBoundingClientRect().bottom -
          root.bounds().bottom +
          settings.padding,
      ),
    );
    const moved =
      this.position !== undefined && Math.abs(actual - this.position) > 1.5;
    // After the stream, following only keeps late layout in view, so a scroll
    // that moved the view relative to the message's end, such as the app
    // scrolling to an earlier row, ends it. Scroll adjustments that keep the
    // end in place, such as clamping or virtualizer corrections, do not.
    if (moved && this.ended && Math.abs(target - actual - this.gap) > 1.5) {
      this.pause();
      return;
    }
    if (this.position === undefined || moved) this.position = actual;
    const smooth = settings.behavior === "smooth" && !this.reduced.matches;
    const elapsed = Math.min(64, Math.max(0, now - this.previous));
    this.previous = now;
    this.position = smooth
      ? target + (this.position - target) * Math.exp(-elapsed / 80)
      : target;
    if (Math.abs(target - this.position) < 0.5) this.position = target;
    // Keep fractional progress internally: browsers can round scroll offsets to whole pixels.
    root.scrollTo(this.position);
    this.gap = target - this.position;
    const settled =
      Math.abs(target - this.position) < 0.5 &&
      Math.abs(target - root.top) <= 1;
    // Stop animation work once settled, but keep observing late chart and expression layout.
    // While streaming, only a reading gesture, an explicit pause, or disposal releases following.
    if (!settled) this.frame = requestAnimationFrame(this.tick);
  };
  dispose() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.releaseAnchor?.();
    this.releaseAnchor = undefined;
    this.observer.disconnect();
    this.unsubscribe();
    this.unlisten();
    this.reduced.removeEventListener("change", this.refresh);
  }
}
