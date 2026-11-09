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
it("publishes instant work once per frame and actions in a microtask, and supports live interval changes", async () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    frames.push(callback),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames[id - 1] = () => {};
  });
  const scheduler = new PresentationScheduler(),
    events: string[] = [];
  scheduler.enqueue("source", () => events.push("source"));
  scheduler.enqueue("bindings", () => events.push("bindings"));
  scheduler.enqueue("bindings", () => events.push("latest bindings"));
  expect(events).toEqual([]);
  frames.splice(0).forEach((frame) => frame(0));
  expect(events).toEqual(["source", "latest bindings"]);
  expect(vi.getTimerCount()).toBe(0);
  // Without a frame, as in a background tab, a timer publishes.
  scheduler.enqueue("source", () => events.push("unpainted"));
  vi.advanceTimersByTime(50);
  expect(events.at(-1)).toBe("unpainted");
  scheduler.configure(200);
  scheduler.enqueue("source", () => events.push("pending source"));
  scheduler.enqueue("bindings", () => events.push("pending bindings"));
  scheduler.enqueue("bindings", () => events.push("action"), true);
  // A later non-urgent task joins the action's microtask.
  scheduler.enqueue("bindings", () => events.push("action, latest"));
  await Promise.resolve();
  expect(events.slice(3)).toEqual(["action, latest"]);
  scheduler.configure(400);
  vi.advanceTimersByTime(349);
  expect(events).toHaveLength(4);
  scheduler.configure("instant");
  frames.splice(0).forEach((frame) => frame(0));
  expect(events.at(-1)).toBe("pending source");
  scheduler.dispose();
  expect(vi.getTimerCount()).toBe(0);
  scheduler.enqueue("ignored", () => events.push("disposed"));
  scheduler.enqueue("ignored", () => events.push("disposed"), true);
  await Promise.resolve();
  expect(events).not.toContain("disposed");
  vi.unstubAllGlobals();
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
