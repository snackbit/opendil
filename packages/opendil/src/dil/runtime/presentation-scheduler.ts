export type UpdateInterval = "instant" | number;
export function parseUpdateInterval(value: unknown): UpdateInterval {
  if (value === undefined || value === "instant") return "instant";
  if (typeof value === "number" && Number.isFinite(value) && value >= 0)
    return value;
  throw new Error(
    "Update interval must be instant or a finite nonnegative number of milliseconds.",
  );
}
/** Latest work per owner, bounded by cadence rather than waiting for a quiet stream. */
export class PresentationScheduler {
  private pending = new Map<string, () => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private last = -Infinity;
  private interval = 0;
  private disposed = false;
  configure(value: UpdateInterval) {
    const parsed = parseUpdateInterval(value);
    this.interval = parsed === "instant" ? 0 : parsed;
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.pending.size) return;
    if (!this.interval) this.flush();
    else this.schedule();
  }
  enqueue(key: string, task: () => void, urgent = false) {
    if (this.disposed) return;
    if (urgent || !this.interval) {
      this.pending.delete(key);
      task();
      return;
    }
    this.pending.set(key, task);
    this.schedule();
  }
  cancel(key: string) {
    this.pending.delete(key);
  }
  private schedule() {
    if (this.timer !== undefined) return;
    this.timer = setTimeout(
      () => this.flush(),
      Math.max(0, this.last + this.interval - performance.now()),
    );
  }
  private flush() {
    this.timer = undefined;
    const tasks = [...this.pending.values()];
    this.pending.clear();
    if (!tasks.length || this.disposed) return;
    this.last = performance.now();
    for (const task of tasks) task();
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending.clear();
  }
}
