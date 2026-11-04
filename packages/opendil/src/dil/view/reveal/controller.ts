import type { PresentationHistory } from "../../runtime/presentation-history";
import type { RevealTiming } from "../reveal-options";
interface Target {
  key: string;
  element: HTMLElement;
  opacity: string;
  endOpacity: string;
  inert: boolean;
  /** Hidden by prepare() and waiting for its animation. */
  hidden?: boolean;
  animation?: Animation;
}
export class RevealController {
  private timing: RevealTiming | null = null;
  private targets = new Map<string, Target>();
  private queued = new Set<Target>();
  private frame = 0;
  private started = false;
  private reduced = false;
  private nextStart = 0;
  constructor(
    readonly history: PresentationHistory,
    private readonly viewport: () => { top: number; bottom: number },
  ) {}
  configure(timing: RevealTiming | null) {
    this.timing = timing;
    if (!timing)
      for (const target of this.targets.values()) this.finish(target);
  }
  start() {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    this.reduced = media.matches;
    this.started = true;
    const change = () => {
      this.reduced = media.matches;
      if (this.reduced) this.showAll();
    };
    media.addEventListener("change", change);
    for (const target of this.queued) this.prepare(target);
    this.schedule();
    return () => {
      this.started = false;
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      media.removeEventListener("change", change);
      // Stopping is not finishing: React replays effects under StrictMode and
      // <Activity>, and the restarted controller reveals what is still queued.
      for (const target of this.targets.values())
        if (target.animation) this.finish(target);
        else this.restore(target);
    };
  }
  register(
    key: string,
    element: HTMLElement,
    eligible: boolean,
    skip: boolean,
  ) {
    const previous = this.targets.get(key);
    if (previous) this.release(previous);
    const target: Target = {
      key,
      element,
      opacity: element.style.opacity,
      endOpacity: "1",
      inert: element.inert,
    };
    this.targets.set(key, target);
    element.dataset.dilPresentation = key;
    if (skip || !eligible || this.history.phase(key) === "visible")
      this.finish(target);
    else {
      this.history.set(key, "ready");
      this.queued.add(target);
      if (this.started) {
        this.prepare(target);
        this.schedule();
      }
    }
    return () => {
      if (this.targets.get(key) !== target) return;
      this.release(target);
      this.targets.delete(key);
    };
  }
  /**
   * Stops tracking a target. A reveal in progress completes at once. A target
   * that never started revealing stays "ready" in history, so registering it
   * again, as React does when it replays refs, reveals it.
   */
  private release(target: Target) {
    if (target.animation) this.finish(target);
    else {
      this.queued.delete(target);
      this.restore(target);
    }
  }
  private restore(target: Target) {
    if (!target.hidden) return;
    target.hidden = false;
    target.element.style.opacity = target.opacity;
    target.element.inert = target.inert;
    delete target.element.dataset.dilPhase;
  }
  private prepare(target: Target) {
    const { element } = target;
    const box = element.getBoundingClientRect(),
      view = this.viewport();
    const root = element.getRootNode();
    const focused =
      root instanceof ShadowRoot
        ? root.activeElement
        : element.ownerDocument.activeElement;
    if (
      !this.timing ||
      this.reduced ||
      !element.isConnected ||
      element.contains(focused) ||
      box.bottom < view.top - 96 ||
      box.top > view.bottom + 96
    ) {
      this.finish(target);
      return;
    }
    target.endOpacity = getComputedStyle(element).opacity;
    element.style.opacity = "0";
    element.inert = true;
    target.hidden = true;
    element.dataset.dilPhase = "ready";
  }
  private finish(target: Target) {
    this.queued.delete(target);
    target.hidden = false;
    const animation = target.animation;
    if (animation) {
      animation.onfinish = null;
      animation.oncancel = null;
      animation.cancel();
      delete target.animation;
    }
    target.element.style.opacity = target.opacity;
    target.element.inert = target.inert;
    target.element.removeAttribute("data-dil-revealing");
    target.element.dataset.dilPhase = "visible";
    this.history.set(target.key, "visible");
  }
  showAll() {
    for (const target of this.targets.values()) this.finish(target);
  }
  private schedule() {
    if (this.started && this.queued.size && !this.frame)
      this.frame = requestAnimationFrame(() => this.flush());
  }
  private flush() {
    this.frame = 0;
    const timing = this.timing;
    if (!timing || this.reduced) {
      this.showAll();
      return;
    }
    const targets = [...this.queued].sort((a, b) =>
      a.element.compareDocumentPosition(b.element) &
      Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1,
    );
    const now = performance.now();
    for (const target of targets) {
      if (!this.queued.has(target)) continue;
      if (
        [...this.targets.values()].some(
          (parent) =>
            parent !== target &&
            parent.element.contains(target.element) &&
            (parent.animation !== undefined || this.queued.has(parent)),
        )
      ) {
        this.finish(target);
        continue;
      }
      this.queued.delete(target);
      const delay = Math.min(
        Math.max(0, this.nextStart - now),
        timing.staggerMs * 6,
      );
      this.nextStart = now + delay + timing.staggerMs;
      this.history.set(target.key, "revealing");
      target.element.dataset.dilPhase = "revealing";
      target.element.dataset.dilRevealing = "true";
      target.animation = target.element.animate(
        [{ opacity: 0 }, { opacity: target.endOpacity }],
        {
          delay,
          duration: timing.durationMs,
          easing: "ease-out",
          fill: "both",
        },
      );
      target.animation.onfinish = () => this.finish(target);
      target.animation.oncancel = () => this.finish(target);
    }
  }
}
