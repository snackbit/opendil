export type UpdateInterval = "instant" | number;
export function parseUpdateInterval(value: unknown): UpdateInterval {
  if (value === undefined || value === "instant") return "instant";
  if (typeof value === "number" && Number.isFinite(value) && value >= 0)
    return value;
  throw new Error(
    "Update interval must be instant or a finite nonnegative number of milliseconds.",
  );
}
/**
 * A frame is the natural batch for presentation: React commits once for every
 * update that arrives before the next paint. Offscreen frames and background
 * tabs may not run animation frames, so a timer bounds the wait.
 */
const FRAME_FALLBACK_MS = 50;
/**
 * Latest work per owner, flushed together. Urgent work, such as the result of
 * a reader's action, publishes in a microtask; other work publishes once per
 * animation frame, and no sooner than the configured interval after the
 * previous publication.
 */
export class PresentationScheduler {
  private pending = new Map<string, () => void>();
  private urgent = new Map<string, () => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private frame = 0;
  private microtask = false;
  private last = -Infinity;
  private interval = 0;
  private disposed = false;
  configure(value: UpdateInterval) {
    const parsed = parseUpdateInterval(value);
    this.interval = parsed === "instant" ? 0 : parsed;
    this.unschedule();
    if (this.pending.size) this.schedule();
  }
  enqueue(key: string, task: () => void, urgent = false) {
    if (this.disposed) return;
    if (urgent) {
      this.pending.delete(key);
      this.urgent.set(key, task);
      if (this.microtask) return;
      this.microtask = true;
      queueMicrotask(() => {
        this.microtask = false;
        const tasks = [...this.urgent.values()];
        this.urgent.clear();
        if (!this.disposed) for (const run of tasks) run();
      });
      return;
    }
    if (this.urgent.has(key)) {
      this.urgent.set(key, task);
      return;
    }
    this.pending.set(key, task);
    this.schedule();
  }
  /** Records a publication made outside the scheduler, such as a first render. */
  published() {
    this.last = performance.now();
  }
  cancel(key: string) {
    this.pending.delete(key);
    this.urgent.delete(key);
  }
  private schedule() {
    if (this.timer !== undefined || this.frame) return;
    if (this.interval) {
      this.timer = setTimeout(
        () => this.flush(),
        Math.max(0, this.last + this.interval - performance.now()),
      );
      return;
    }
    if (typeof requestAnimationFrame === "function")
      this.frame = requestAnimationFrame(() => this.flush());
    this.timer = setTimeout(() => this.flush(), FRAME_FALLBACK_MS);
  }
  private unschedule() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
  private flush() {
    this.unschedule();
    const tasks = [...this.pending.values()];
    this.pending.clear();
    if (!tasks.length || this.disposed) return;
    this.last = performance.now();
    for (const task of tasks) task();
  }
  dispose() {
    this.disposed = true;
    this.unschedule();
    this.pending.clear();
    this.urgent.clear();
  }
}
