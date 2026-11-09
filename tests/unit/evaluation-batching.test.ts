import { resolveObjectURL } from "node:buffer";
import { readFileSync } from "node:fs";
import { Worker as Thread } from "node:worker_threads";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExpressionEngine } from "../../packages/opendil/src/dil/runtime/expressions";

/*
 * evaluation-batching.test.ts: the transport cost of a document, counted
 * against the real QuickJS worker. A mount sends its evaluations in one
 * message, an action's reply carries the results it changed, and each reply
 * reaches views in one store update.
 */
const posted: Array<Record<string, unknown>> = [];
const engines: ExpressionEngine[] = [];
let replyDelay = 0;
class CountingWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  private thread: Thread | undefined;
  private queue: unknown[] = [];
  constructor(url: string) {
    const blob = resolveObjectURL(url);
    if (!blob) throw new Error("Missing worker blob");
    void blob.text().then((source) => {
      const thread = new Thread(
        `const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=data=>parentPort.postMessage(data);${source};parentPort.on('message',data=>self.onmessage({data}));`,
        { eval: true },
      );
      this.thread = thread;
      thread.on("message", (data) => {
        if (replyDelay)
          setTimeout(() => this.onmessage?.({ data }), replyDelay);
        else this.onmessage?.({ data });
      });
      for (const message of this.queue) thread.postMessage(message);
      this.queue = [];
    });
  }
  postMessage(message: Record<string, unknown>) {
    // The boot message carries no work.
    if (message.type !== "init") posted.push(message);
    if (this.thread) this.thread.postMessage(message);
    else this.queue.push(message);
  }
  terminate() {
    void this.thread?.terminate();
  }
}
beforeEach(() => {
  posted.length = 0;
  replyDelay = 0;
  vi.stubGlobal("Worker", CountingWorker);
  vi.stubGlobal(
    "__DIL_VM_WORKER__",
    readFileSync("packages/opendil/dist/test/vm.js", "utf8"),
  );
});
afterEach(() => {
  engines.splice(0).forEach((engine) => engine.dispose());
  vi.unstubAllGlobals();
});
function create() {
  const engine = new ExpressionEngine();
  engines.push(engine);
  return engine;
}
/** Non-urgent results publish with the next frame, or its timer fallback. */
const published = () => new Promise((resolve) => setTimeout(resolve, 80));
function countUpdates(engine: ExpressionEngine) {
  let updates = 0;
  engine.store.subscribe(() => updates++);
  return () => updates;
}

it("sends a mount's declarations and evaluations in one message and publishes them in one update", async () => {
  const engine = create();
  const updates = countUpdates(engine);
  engine.declare("const [n,setN]=DIL.useState(2)");
  engine.declare("const total=n*3");
  const release = engine.retain(["n", "total", "total + 1", "setN"]);
  engine.retain(["`${n} items`"], {});
  await vi.waitFor(() => expect(engine.idle).toBe(true));
  expect(posted.map((message) => message.type)).toEqual(["batch"]);
  expect(posted[0]?.steps).toHaveLength(2);
  expect(posted[0]?.evaluations).toHaveLength(5);
  expect(engine.read("total + 1")).toBe(7);
  await published();
  expect(updates()).toBe(1);
  release();
});

it("refreshes an action's dependents in the action's own reply", async () => {
  const engine = create();
  engine.declare("const [n,setN]=DIL.useState(1)");
  engine.declare("const [other,setOther]=DIL.useState(0)");
  engine.retain(["n * 2", "other", "setN", "40 + 2"]);
  await vi.waitFor(() => expect(engine.idle).toBe(true));
  await published();
  const before = engine.store.getState();
  const updates = countUpdates(engine);
  posted.length = 0;
  const setter = engine.read("setN");
  if (typeof setter !== "function") throw new Error("Missing setter");
  setter(5);
  await vi.waitFor(() => expect(engine.read("n * 2")).toBe(10));
  await published();
  // One message per value change; it lists what the worker may refresh.
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ type: "call" });
  const dependents = (posted[0]?.dependents ?? []) as Array<{
    source: string;
    dependencies?: string[];
  }>;
  expect(dependents.map((entry) => entry.source).sort()).toEqual([
    "40 + 2",
    "n * 2",
    "other",
    "setN",
  ]);
  // One urgent store update, and only the expression that read n changed.
  expect(updates()).toBe(1);
  const after = engine.store.getState();
  expect(engine.signature(["n * 2"], {}, after)).not.toBe(
    engine.signature(["n * 2"], {}, before),
  );
  expect(engine.signature(["other", "40 + 2"], {}, after)).toBe(
    engine.signature(["other", "40 + 2"], {}, before),
  );
});

it("publishes nothing when a declaration leaves every result as it was", async () => {
  const engine = create();
  engine.declare("const [n,setN]=DIL.useState(1)");
  engine.retain(["n + 1"]);
  await vi.waitFor(() => expect(engine.idle).toBe(true));
  await published();
  const updates = countUpdates(engine);
  const value = engine.read("n + 1");
  engine.declare("const later=4");
  await vi.waitFor(() => expect(engine.idle).toBe(true));
  await published();
  // The declaration made "n + 1" evaluate again; its value did not change.
  expect(posted.length).toBeGreaterThan(1);
  expect(updates()).toBe(0);
  expect(engine.read("n + 1")).toBe(value);
});

it("accepts a slow action reply carrying many refreshed QuickJS results", async () => {
  const engine = create();
  engine.declare("const [n,setN]=DIL.useState(1)");
  const expressions = Array.from({ length: 256 }, (_, index) => `n + ${index}`);
  engine.retain([...expressions, "setN"]);
  await vi.waitFor(() => expect(engine.idle).toBe(true));
  const setter = engine.read("setN");
  if (typeof setter !== "function") throw new Error("Missing setter");
  // Delay only the transport, keeping the workload deterministic across CPUs.
  // The real QuickJS runtime still evaluates and refreshes all 256 results.
  replyDelay = 1100;
  setter(5);
  await vi.waitFor(() => expect(engine.idle).toBe(true), { timeout: 3000 });
  expect(engine.stopped).toBe(false);
  expect(expressions.map((source) => engine.read(source))).toEqual(
    Array.from({ length: 256 }, (_, index) => index + 5),
  );
  replyDelay = 0;
  setter(8);
  await vi.waitFor(() => expect(engine.read("n + 255")).toBe(263));
  expect(engine.stopped).toBe(false);
});

it("drops a result an action invalidated after the evaluation left", async () => {
  const engine = create();
  engine.declare("const [n,setN]=DIL.useState(0)");
  engine.retain(["setN"]);
  await vi.waitFor(() => expect(engine.idle).toBe(true));
  const setter = engine.read("setN");
  if (typeof setter !== "function") throw new Error("Missing setter");
  // "n" leaves in a batch, and the action leaves right after it.
  engine.retain(["n"]);
  await Promise.resolve();
  setter(3);
  await vi.waitFor(() => expect(engine.idle).toBe(true));
  expect(engine.read("n")).toBe(3);
  expect(engine.evaluationRevision("n")).toBe(1);
});
