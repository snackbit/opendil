import { afterEach, expect, it, vi } from "vitest";
import {
  ExecutionQueue,
  type ExecutionJob,
} from "../../packages/opendil/src/dil/runtime/execution-queue";
afterEach(() => vi.useRealTimers());
it("bounds evaluations, prioritizes actions, and starts deadlines only on dispatch", () => {
  vi.useFakeTimers();
  const post = vi.fn(),
    receive = vi.fn(),
    failure = vi.fn();
  const queue = new ExecutionQueue(post, receive, failure);
  for (let index = 0; index < 1030; index++)
    queue.evaluate(String(index), { source: String(index) });
  expect(queue.stats.evaluations).toBe(4);
  expect(queue.stats.queued).toBe(1024);
  expect(queue.evaluate("1029", {})).toBe(false);
  expect(queue.evaluate("0", {})).toBe(true);
  expect(vi.getTimerCount()).toBe(4);
  queue.mutate({ type: "call", payload: { handle: 1 } });
  expect(post.mock.calls[4]?.[0]).toMatchObject({ type: "call" });
  queue.reply({ id: 999 });
  queue.reply({ id: 1 });
  expect(receive).toHaveBeenCalledTimes(1);
  queue.cancel("1000");
  expect(queue.has("1000")).toBe(false);
  queue.stop();
  expect(vi.getTimerCount()).toBe(0);
  expect(queue.evaluate("stopped", {})).toBe(true);
  queue.mutate({ type: "call", payload: {} });
});
it("coalesces queued setters and preserves non-replaceable action barriers", () => {
  const post = vi.fn();
  const queue = new ExecutionQueue(
    post,
    () => {},
    () => {},
  );
  queue.mutate({ type: "call", payload: { handle: 0 } });
  const job = (value: number): ExecutionJob => ({
    type: "call",
    setter: "name",
    payload: { value },
  });
  queue.mutate(job(1));
  expect(queue.mutate(job(2))?.payload).toEqual({ value: 1 });
  queue.mutate({ type: "call", payload: { handle: 99 } });
  queue.mutate(job(3));
  expect(queue.stats.mutations).toBe(3);
  queue.reply({ id: 1 });
  queue.reply({ id: 2 });
  queue.reply({ id: 3 });
  expect(post.mock.calls.slice(1).map((call) => call[0])).toEqual([
    expect.objectContaining({ value: 2 }),
    expect.objectContaining({ handle: 99 }),
    expect.objectContaining({ value: 3 }),
  ]);
  queue.stop();
});
it("retains action-flood and transport failure guards", () => {
  const failure = vi.fn();
  const queue = new ExecutionQueue(
    () => {},
    () => {},
    failure,
  );
  for (let index = 0; index < 265; index++)
    queue.mutate({ type: "call", payload: {} });
  expect(failure).toHaveBeenCalledWith(
    expect.stringContaining("too many actions"),
  );
  queue.stop();
  const broken = new ExecutionQueue(
    () => {
      throw new Error("port closed");
    },
    () => {},
    failure,
  );
  broken.evaluate("one", {});
  expect(failure).toHaveBeenCalledWith("Message execution worker failed.");
  broken.stop();
});
