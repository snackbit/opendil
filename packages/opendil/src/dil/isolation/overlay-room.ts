import type { OverlayRoom } from "../../components/ui/overlays/ui-scope";

/** Farther below the frame than any overlay extends. */
const UNBOUNDED = 100_000;

/**
 * Decides how far overlays may extend below the frame's bottom. The host grows
 * the content-sized frame to show an overlay that extends past it, but cannot
 * grow it upward, so an overlay that flips above a trigger is clipped at the
 * frame's top.
 *
 * Overlays may use the part of the host's scroller that is visible below the
 * frame, as they would in host mode. When one is clipped at the top anyway, for
 * example in a short frame at the bottom of the scroller, overlays may extend
 * any distance below until all of them close, and the reader can scroll to them.
 */
export class FrameOverlayRoom implements OverlayRoom {
  private readonly listeners = new Set<() => void>();
  private room = 0;
  private unbounded = false;
  /** `visibleBottom` is the bottom of the host's visible area, in frame coordinates. */
  constructor(
    private readonly visibleBottom: () => number,
    private readonly frameHeight: () => number,
  ) {}
  below = () => this.room;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  /** Recomputes the room after the visible area or the frame's height changed. */
  update = () => {
    const room = this.unbounded
      ? UNBOUNDED
      : Math.max(0, Math.floor(this.visibleBottom() - this.frameHeight()));
    if (room === this.room) return;
    this.room = room;
    for (const listener of [...this.listeners]) listener();
  };
  /** Receives the boxes of the placed, open overlays, in frame coordinates. */
  track(overlays: readonly { top: number }[]) {
    const unbounded =
      overlays.length > 0 &&
      (this.unbounded || overlays.some((box) => box.top < -1));
    if (unbounded === this.unbounded) return;
    this.unbounded = unbounded;
    this.update();
  }
}
