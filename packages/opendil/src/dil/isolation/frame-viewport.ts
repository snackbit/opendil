import type { ScrollRootTracker } from "../view/scroll/root-tracker";
import { encloses, listenForScroll } from "../view/scroll/scroll-root";

export interface FrameViewportMessage {
  type: "viewport";
  revision: number;
  offset: number;
  height: number;
  width: number;
}
/**
 * Tells the frame which part of it is visible in the host's scroller, the
 * page or a scroll container, so virtualized content inside can mount.
 */
export class FrameViewportReporter {
  private revision = 0;
  private lastOffset = 0;
  private movedAtRevision = 0;
  private observed: HTMLElement | null = null;
  private readonly stop: () => void;
  constructor(
    private readonly frame: HTMLIFrameElement,
    private readonly scroller: ScrollRootTracker,
    private readonly post: (message: FrameViewportMessage) => void,
  ) {
    const view = frame.ownerDocument.defaultView;
    const resize = new ResizeObserver(this.report);
    resize.observe(frame);
    const rebind = () => {
      if (this.observed) resize.unobserve(this.observed);
      this.observed = scroller.current?.element ?? null;
      if (this.observed) resize.observe(this.observed);
      this.report();
    };
    const unsubscribe = scroller.subscribe(rebind);
    rebind();
    // The page and any scrolling ancestor move the frame.
    const unlisten = listenForScroll(frame, (event) => {
      const source = event.target;
      if (!view || !(source instanceof view.Element) || encloses(source, frame))
        this.report();
    });
    view?.addEventListener("resize", this.report);
    this.stop = () => {
      unsubscribe();
      resize.disconnect();
      unlisten();
      view?.removeEventListener("resize", this.report);
    };
  }
  private visible() {
    const root = this.scroller.rootFor(this.frame);
    const box = this.frame.getBoundingClientRect();
    const bounds = root?.bounds() ?? { top: 0, bottom: innerHeight };
    return { root, box, bounds, offset: Math.max(0, bounds.top - box.top) };
  }
  report = () => {
    const { box, bounds, offset } = this.visible();
    if (offset !== this.lastOffset) this.movedAtRevision = this.revision + 1;
    this.lastOffset = offset;
    // The frame is sized to its content, so its height trails each commit: it
    // starts 0 px tall and grows after content arrives. Content added at its
    // end appears in the scroller below the frame's current bottom, so that
    // region counts as visible, and a commit can reveal and virtualize a full
    // screen. A frame scrolled out above the scroller shows nothing.
    const bottom = box.bottom > bounds.top ? bounds.bottom : box.bottom;
    this.post({
      type: "viewport",
      revision: ++this.revision,
      offset,
      height: Math.max(
        0,
        Math.min(bottom, bounds.bottom) - Math.max(box.top, bounds.top),
      ),
      width: box.width,
    });
  };
  /**
   * Scrolls the host until frame offset `offset` is at the visible top. A
   * request from before the reader's latest scroll is discarded.
   */
  scroll(offset: number, revision: number) {
    // Size-only reports do not supersede a correction for the same reading position.
    if (revision < this.movedAtRevision || revision > this.revision) return;
    const { root, box, bounds, offset: current } = this.visible();
    if (
      root &&
      Math.abs(current - this.lastOffset) < 2 &&
      box.top < bounds.bottom &&
      box.bottom > bounds.top
    )
      root.scrollTo(
        root.top +
          box.top -
          bounds.top +
          Math.max(0, Math.min(box.height, offset)),
      );
  }
  dispose() {
    this.stop();
  }
}
