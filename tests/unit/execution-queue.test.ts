import { afterEach, expect, it, vi } from "vitest";
import {
  ExecutionQueue,
  readReply,
  type ExecutionJob,
} from "../../packages/opendil/src/dil/runtime/execution-queue";
afterEach(() => vi.useRealTimers());
/** Evaluations and declarations leave together once the task has queued them. */
const drained = () => Promise.resolve();
it("sends one batch per task, prioritizes actions, and starts deadlines only on dispatch", async () => {
  vi.useFakeTimers();
  const post = vi.fn(),
    receive = vi.fn(),
    failure = vi.fn();
  const queue = new ExecutionQueue(post, receive, failure);
  queue.mutate({ type: "declare", payload: { source: "const a=1" } });
  for (let index = 0; index < 1030; index++)
    queue.evaluate(String(index), { source: String(index) });
  expect(queue.stats.queued).toBe(1024);
  expect(queue.evaluate("1029", {})).toBe(false);
  expect(queue.evaluate("0", {})).toBe(true);
  expect(post).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  await drained();
  // The declaration leads the first batch; a batch carries at most 512 evaluations.
  expect(post).toHaveBeenCalledOnce();
  const batch = post.mock.calls[0]?.[0];
  expect(batch).toMatchObject({
    id: 1,
    type: "batch",
    steps: [{ type: "declare", source: "const a=1" }],
  });
  expect(batch.evaluations).toHaveLength(512);
  expect(batch.evaluations[0]).toEqual({ key: "0", source: "0" });
  expect(queue.stats.evaluations).toBe(512);
  expect(queue.stats.queued).toBe(512);
  expect(vi.getTimerCount()).toBe(1);
  queue.mutate({ type: "call", payload: { handle: 1 } });
  expect(post.mock.calls[1]?.[0]).toMatchObject({ id: 2, type: "call" });
  queue.reply({ id: 999 });
  queue.reply({ id: 1, steps: [{}], results: [] });
  expect(receive).toHaveBeenCalledOnce();
  expect(receive.mock.calls[0]?.[0]).toMatchObject({
    type: "batch",
    steps: [{ type: "declare" }],
  });
  // The rest follows at once in one more batch.
  expect(post).toHaveBeenCalledTimes(3);
  expect(post.mock.calls[2]?.[0].evaluations).toHaveLength(512);
  queue.cancel("1000");
  expect(queue.has("1000")).toBe(true);
  expect(queue.idle).toBe(false);
  queue.stop();
  expect(vi.getTimerCount()).toBe(0);
  expect(queue.evaluate("stopped", {})).toBe(true);
  queue.mutate({ type: "call", payload: {} });
});
it("holds evaluations behind a queued action, so they read the state it writes", async () => {
  const post = vi.fn();
  const queue = new ExecutionQueue(
    post,
    () => {},
    () => {},
  );
  queue.mutate({ type: "call", payload: { handle: 0 } });
  queue.mutate({ type: "call", payload: { handle: 1 } });
  queue.evaluate("later", { source: "later" });
  await drained();
  expect(post).toHaveBeenCalledOnce();
  expect(queue.idle).toBe(false);
  queue.reply({ id: 1 });
  queue.reply({ id: 2 });
  expect(post.mock.calls.map((call) => call[0].type)).toEqual([
    "call",
    "call",
    "batch",
  ]);
  queue.reply({ id: 3, results: [{ key: "later", value: 1 }] });
  expect(queue.idle).toBe(true);
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
it("retains action-flood and transport failure guards", async () => {
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
    "limit",
    "action-limit",
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
  await drained();
  expect(failure).toHaveBeenCalledWith(
    "Message execution worker failed.",
    "runtime",
    "runtime-crashed",
  );
  broken.stop();
});
it("gives jobs sent before the runtime first answers time to start it, and a batch time per job", async () => {
  vi.useFakeTimers();
  const post = vi.fn(),
    failure = vi.fn();
  const queue = new ExecutionQueue(post, () => {}, failure);
  queue.evaluate("cold", {});
  await drained();
  vi.advanceTimersByTime(4999);
  expect(failure).not.toHaveBeenCalled();
  queue.reply({ id: 1 });
  queue.evaluate("warm", {});
  queue.evaluate("second", {});
  await drained();
  vi.advanceTimersByTime(1249);
  expect(failure).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(failure).toHaveBeenCalledWith(
    "Execution stopped: the action exceeded its time limit.",
    "limit",
    "execution-timeout",
  );
  const stalled = vi.fn();
  new ExecutionQueue(post, () => {}, stalled).evaluate("never", {});
  await drained();
  vi.advanceTimersByTime(5000);
  expect(stalled).toHaveBeenCalledOnce();
  queue.stop();
});
it("starts a job's time limit when the serial worker reaches it, not while it waits behind a batch", async () => {
  vi.useFakeTimers();
  const post = vi.fn(),
    failure = vi.fn();
  const queue = new ExecutionQueue(post, () => {}, failure);
  queue.evaluate("boot", {});
  await drained();
  queue.reply({ id: 1 });
  // A batch of 9 evaluations has 1000 + 8 * 250 ms; an action sent behind it waits.
  for (let index = 0; index < 9; index++) queue.evaluate("key" + index, {});
  await drained();
  queue.mutate({ type: "call", payload: { handle: 1 } });
  expect(post).toHaveBeenCalledTimes(3);
  expect(vi.getTimerCount()).toBe(1);
  vi.advanceTimersByTime(2900);
  queue.reply({ id: 2 });
  // The action has its full second from here.
  vi.advanceTimersByTime(999);
  expect(failure).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(failure).toHaveBeenCalledWith(
    "Execution stopped: the action exceeded its time limit.",
    "limit",
    "execution-timeout",
  );
  queue.stop();
});
it("keeps only well-formed results of a batch reply", () => {
  expect(
    readReply({
      id: 4,
      revision: 2,
      steps: [{ changed: true, revision: 2 }, "bad"],
      results: [
        { key: "a", value: 1, dependencies: ["n"], handles: [3] },
        { key: 7, value: 2 },
        { key: "b", error: "failed", handles: ["x"], bindings: [1] },
      ],
    }),
  ).toEqual({
    id: 4,
    revision: 2,
    steps: [{ changed: true, revision: 2 }],
    results: [
      { key: "a", value: 1, dependencies: ["n"], handles: [3] },
      { key: "b", error: "failed" },
    ],
  });
  expect(readReply({ id: 1, results: "none" })).toEqual({ id: 1 });
});

it("budgets an action for the dependents retained when it leaves the queue", async () => {
  vi.useFakeTimers();
  const post = vi.fn(),
    failure = vi.fn();
  let dependents: Record<string, unknown>[] = [];
  const queue = new ExecutionQueue(
    post,
    () => {},
    failure,
    () => dependents,
  );
  queue.evaluate("boot", {});
  await drained();
  queue.reply({ id: 1 });
  queue.mutate({ type: "call", payload: { handle: 1 } });
  queue.mutate({ type: "call", payload: { handle: 2 } });
  dependents = Array.from({ length: 9 }, (_, index) => ({
    key: String(index),
    source: "n",
  }));
  queue.reply({ id: 2 });
  expect(post.mock.calls.at(-1)?.[0]).toMatchObject({ handle: 2, dependents });
  vi.advanceTimersByTime(3249);
  expect(failure).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(failure).toHaveBeenCalledWith(
    expect.any(String),
    "limit",
    "execution-timeout",
  );
  queue.stop();
});
