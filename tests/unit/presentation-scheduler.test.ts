import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  PresentationScheduler,
  parseUpdateInterval,
} from "../../packages/opendil/src/dil/runtime/presentation-scheduler";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.spyOn(performance, "now").mockImplementation(() => Date.now());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("publishes latest source throughout a continuous stream without waiting for a quiet gap", () => {
  const scheduler = new PresentationScheduler(),
    commits: Array<{ time: number; value: number }> = [];
  scheduler.configure(200);
  for (let value = 0; value <= 20; value++) {
    scheduler.enqueue("source", () =>
      commits.push({ time: Date.now(), value }),
    );
    vi.advanceTimersByTime(33);
  }
  expect(commits).toEqual([
    { time: 0, value: 0 },
    { time: 200, value: 6 },
    { time: 400, value: 12 },
    { time: 600, value: 18 },
  ]);
  vi.advanceTimersByTime(107);
  expect(commits.at(-1)).toEqual({ time: 800, value: 20 });
  scheduler.dispose();
});
it("keeps actions immediate while stream work remains coalesced, and supports live interval changes", () => {
  const scheduler = new PresentationScheduler(),
    events: string[] = [];
  scheduler.enqueue("first", () => events.push("instant"));
  scheduler.configure(200);
  scheduler.enqueue("source", () => events.push("first source"));
  vi.advanceTimersByTime(0);
  scheduler.enqueue("source", () => events.push("pending source"));
  scheduler.enqueue("bindings", () => events.push("pending bindings"));
  vi.advanceTimersByTime(50);
  scheduler.enqueue("bindings", () => events.push("action"), true);
  expect(events).toEqual(["instant", "first source", "action"]);
  scheduler.configure(400);
  vi.advanceTimersByTime(349);
  expect(events).toHaveLength(3);
  scheduler.configure("instant");
  expect(events.at(-1)).toBe("pending source");
  expect(vi.getTimerCount()).toBe(0);
  scheduler.dispose();
  scheduler.enqueue("ignored", () => events.push("disposed"));
  expect(events).not.toContain("disposed");
});
it("cancels abandoned work and validates public and frame-boundary values", () => {
  expect(parseUpdateInterval(undefined)).toBe("instant");
  for (const value of ["instant", 0, 200])
    expect(parseUpdateInterval(value)).toBe(value);
  for (const value of [null, false, "200", -1, Infinity, NaN])
    expect(() => parseUpdateInterval(value)).toThrow("Update interval");
  const scheduler = new PresentationScheduler(),
    callback = vi.fn();
  scheduler.configure(200);
  scheduler.enqueue("source", callback);
  scheduler.cancel("source");
  vi.advanceTimersByTime(0);
  expect(callback).not.toHaveBeenCalled();
  scheduler.enqueue("source", callback);
  scheduler.dispose();
  vi.advanceTimersByTime(1000);
  expect(callback).not.toHaveBeenCalled();
});
