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
/**
 * Fades in blocks of a streaming answer as they arrive. Only text that
 * arrives while the renderer streams reveals: a finished answer, history and
 * the part of an answer that existed when the renderer mounted show at once,
 * and the controller then neither measures nor touches their elements.
 */
export class RevealController {
  private timing: RevealTiming | null = null;
  private streaming = false;
  /**
   * The source offset from which blocks may reveal: the text's length when
   * the renderer mounted while streaming, otherwise never.
   */
  revealFrom = Infinity;
  private targets = new Map<string, Target>();
  private queued = new Set<Target>();
  /** Queued targets whose layout is read together, before any is hidden. */
  private preparing = new Set<Target>();
  private preparation = false;
  private frame = 0;
  private started = false;
  private reduced = false;
  private nextStart = 0;
  constructor(
    readonly history: PresentationHistory,
    private readonly viewport: () => { top: number; bottom: number },
  ) {}
  /**
   * Sets the rule's inputs during render: the refs of a commit register
   * before its layout effects run. The effects then call configure() and
   * setStreaming(), which also finish what can no longer reveal.
   */
  prime(timing: RevealTiming | null, streaming: boolean, revealFrom: number) {
    this.timing = timing;
    this.streaming = streaming;
    this.revealFrom = revealFrom;
  }
  configure(timing: RevealTiming | null) {
    this.timing = timing;
    if (!timing) this.showAll();
  }
  /** The end of a stream shows every queued and fading block at once. */
  setStreaming(streaming: boolean) {
    this.streaming = streaming;
    if (!streaming) this.showAll();
  }
  private get active() {
    return this.timing !== null && this.streaming && !this.reduced;
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
    for (const target of this.queued) this.preparing.add(target);
    this.prepareAll();
    return () => {
      this.started = false;
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      media.removeEventListener("change", change);
      this.preparing.clear();
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
    offset = Infinity,
  ) {
    const previous = this.targets.get(key);
    if (previous) {
      this.release(previous);
      this.targets.delete(key);
    }
    if (
      !this.active ||
      skip ||
      !eligible ||
      offset < this.revealFrom ||
      this.history.phase(key) === "visible"
    ) {
      this.history.set(key, "visible");
      return () => {};
    }
    const target: Target = {
      key,
      element,
      opacity: element.style.opacity,
      endOpacity: "1",
      inert: element.inert,
    };
    this.targets.set(key, target);
    element.dataset.dilPresentation = key;
    this.history.set(key, "ready");
    this.queued.add(target);
    if (this.started) {
      this.preparing.add(target);
      // Ref callbacks of one commit register one after another; measuring
      // them together after the commit forces one layout instead of one each.
      if (!this.preparation) {
        this.preparation = true;
        queueMicrotask(() => {
          this.preparation = false;
          this.prepareAll();
        });
      }
      this.schedule();
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
    this.preparing.delete(target);
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
  /** Reads every pending target's layout, then hides those that will fade in. */
  private prepareAll(schedule = true) {
    const targets = [...this.preparing];
    this.preparing.clear();
    if (!targets.length) return;
    if (!this.active) {
      for (const target of targets) this.finish(target);
      return;
    }
    const view = this.viewport();
    const decisions = targets.map((target) => {
      const { element } = target;
      if (
        // DOMs without the Web Animations API, such as jsdom, show it at once.
        typeof element.animate !== "function" ||
        !element.isConnected
      )
        return false;
      const root = element.getRootNode();
      const focused =
        root instanceof ShadowRoot
          ? root.activeElement
          : element.ownerDocument.activeElement;
      if (element.contains(focused)) return false;
      const box = element.getBoundingClientRect();
      if (box.bottom < view.top - 96 || box.top > view.bottom + 96)
        return false;
      target.endOpacity = getComputedStyle(element).opacity;
      return true;
    });
    targets.forEach((target, index) => {
      if (!this.queued.has(target)) return;
      if (!decisions[index]) {
        this.finish(target);
        return;
      }
      const { element } = target;
      element.style.opacity = "0";
      element.inert = true;
      target.hidden = true;
      element.dataset.dilPhase = "ready";
    });
    if (schedule) this.schedule();
  }
  private finish(target: Target) {
    this.queued.delete(target);
    this.preparing.delete(target);
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
    // Normally prepared in a microtask already; a frame never shows them unprepared.
    this.prepareAll(false);
    const timing = this.timing;
    if (!timing || !this.active) {
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
