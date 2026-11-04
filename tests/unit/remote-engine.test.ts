import { resolveObjectURL } from "node:buffer";
import { readFileSync } from "node:fs";
import { Worker as Thread } from "node:worker_threads";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExpressionEngine } from "../../packages/opendil/src/dil/runtime/expressions";
import { ActionReceipt } from "../../packages/opendil/src/dil/runtime/action-receipt";
import { DilDocument } from "../../packages/opendil/src/dil/runtime/document";
import { DilParser } from "../../packages/opendil/src/dil/parser/dil-parser";
import { ChildList } from "../../packages/opendil/src/dil/runtime/child-list";
import { PresentationScheduler } from "../../packages/opendil/src/dil/runtime/presentation-scheduler";
const engines: ExpressionEngine[] = [];
const facades: BrowserWorker[] = [];
class BrowserWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  private thread: Thread | undefined;
  private queue: unknown[] = [];
  private stopped = false;
  constructor(url: string) {
    facades.push(this);
    const blob = resolveObjectURL(url);
    if (!blob) throw new Error("Missing worker blob");
    void blob.text().then((source) => {
      if (this.stopped) return;
      const thread = new Thread(
        `const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=data=>parentPort.postMessage(data);${source};parentPort.on('message',data=>self.onmessage({data}));`,
        { eval: true },
      );
      this.thread = thread;
      thread.on("message", (data) => this.onmessage?.({ data }));
      thread.on("error", () => this.onerror?.());
      for (const message of this.queue) thread.postMessage(message);
      this.queue = [];
    });
  }
  postMessage(value: unknown) {
    if (this.thread) this.thread.postMessage(value);
    else this.queue.push(value);
  }
  terminate() {
    this.stopped = true;
    void this.thread?.terminate();
  }
}
beforeEach(() => {
  vi.stubGlobal("Worker", BrowserWorker);
  vi.stubGlobal(
    "__DIL_VM_WORKER__",
    readFileSync("packages/opendil/dist/test/vm.js", "utf8"),
  );
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => {
  vi.useRealTimers();
  engines.splice(0).forEach((engine) => engine.dispose());
  vi.unstubAllGlobals();
});
it("evicts inactive callback results and releases their worker handles", async () => {
  // Controlled transport isolates cache ownership; the other tests use real QuickJS.
  const released: number[] = [];
  class ImmediateWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    private stopped = false;
    postMessage(message: { id: number; type: string; handles?: number[] }) {
      if (message.type === "release") released.push(...(message.handles ?? []));
      queueMicrotask(() => {
        if (!this.stopped)
          this.onmessage?.({
            data:
              message.type === "evaluate"
                ? {
                    id: message.id,
                    value: { $dilHandler: message.id },
                    handles: [message.id],
                    dependencies: [],
                    revision: 0,
                  }
                : { id: message.id },
          });
      });
    }
    terminate() {
      this.stopped = true;
    }
  }
  vi.stubGlobal("Worker", ImmediateWorker);
  const engine = create();
  for (let index = 0; index < 2100; index++) {
    try {
      engine.evaluate("callback" + index);
    } catch {
      /* Still pending. */
    }
  }
  await vi.waitFor(() =>
    expect(engine.stats.inFlight + engine.stats.queued).toBe(0),
  );
  expect(engine.stats.cached).toBeLessThanOrEqual(2048);
  expect(engine.stats.handles).toBeLessThanOrEqual(2048);
  expect(released.length).toBeGreaterThan(0);
  const callback = engine.read("callback2099");
  if (typeof callback !== "function") throw new Error("Missing callback");
  callback();
  await vi.waitFor(() => expect(engine.stats.inFlight).toBe(0));
  const errors: string[] = [];
  engine.events.addEventListener("dil:error", (event) => {
    if (event instanceof CustomEvent) errors.push(String(event.detail));
  });
  engine.halt("Stopped deliberately");
  engine.halt("Duplicate");
  expect(engine.read("callback2099")).toBe(callback);
  callback();
  expect(errors).toEqual(["Stopped deliberately"]);
});
function create() {
  const engine = new ExpressionEngine();
  engines.push(engine);
  return engine;
}
it("publishes action-driven binding refreshes immediately even with slow streaming presentation", async () => {
  const scheduler = new PresentationScheduler();
  scheduler.configure(60000);
  const engine = new ExpressionEngine(new EventTarget(), scheduler);
  engines.push(engine);
  engine.declare("const [count,setCount]=DIL.useState(0)");
  const release = engine.retain(["count", "setCount"]);
  await vi.waitFor(() => expect(engine.hasValue("setCount")).toBe(true));
  let announced = false;
  const unsubscribe = engine.store.subscribe(() => {
    if (engine.hasValue("count") && engine.read("count") === 1)
      announced = true;
  });
  const setter = engine.read("setCount");
  if (typeof setter !== "function") throw new Error("Missing setter");
  setter(1);
  await vi.waitFor(() => expect(announced).toBe(true));
  expect(engine.read("count")).toBe(1);
  unsubscribe();
  release();
});
it("distinguishes cached presentation from pending and stopped execution", async () => {
  const engine = create();
  expect(engine.hasValue("missing")).toBe(false);
  expect(engine.isFresh("missing")).toBe(false);
  expect(await value(engine, "1")).toBe(1);
  expect(engine.hasValue("1")).toBe(true);
  expect(engine.isFresh("1")).toBe(true);
  await expect(value(engine, "unknownName")).rejects.toThrow();
  expect(engine.hasValue("unknownName")).toBe(false);
  engine.halt("Stopped");
  expect(engine.isFresh("1")).toBe(true);
  const release = engine.retain(["1"]);
  release();
  expect(() => engine.declare("const later=1")).toThrow("Stopped");
});
it("drops an abandoned callback response and keeps later demand usable", async () => {
  const engine = create();
  const release = engine.retain(["()=>1"]);
  release();
  await vi.waitFor(() => expect(engine.stats.inFlight).toBe(0));
  expect(engine.stats.handles).toBe(0);
  expect(() => engine.read("()=>1")).toThrow("Waiting");
  expect(typeof (await value(engine, "()=>1"))).toBe("function");
});
it("coalesces a setter burst without losing its latest revision", async () => {
  const engine = create();
  engine.declare("const [n,setN]=DIL.useState(0)");
  const setter = await value(engine, "setN");
  if (typeof setter !== "function") throw new Error("Missing setter");
  for (let index = 1; index <= 50; index++) setter(index);
  await vi.waitFor(async () => expect(await value(engine, "n")).toBe(50));
  expect(engine.evaluationRevision("n")).toBe(50);
});
it("invalidates state dependencies without waking unrelated expressions", async () => {
  const engine = create();
  engine.declare("const [n,setN]=DIL.useState(1)");
  expect(await value(engine, "n * 2")).toBe(2);
  expect(await value(engine, "40 + 2")).toBe(42);
  const signature = engine.signature(["40 + 2"], {}, engine.store.getState());
  const setter = await value(engine, "setN");
  if (typeof setter !== "function") throw new Error("Missing setter");
  setter(3);
  await vi.waitFor(async () => expect(await value(engine, "n * 2")).toBe(6));
  expect(engine.signature(["40 + 2"], {}, engine.store.getState())).toBe(
    signature,
  );
});
it("coalesces replaceable setters and flushes their latest value before an action", async () => {
  const engine = create();
  engine.declare('const [name,setName]=DIL.useState("")');
  engine.declare('const [saved,setSaved]=DIL.useState("")');
  const setter = await value(engine, "setName");
  const save = await value(engine, "()=>setSaved(name)");
  if (typeof setter !== "function" || typeof save !== "function")
    throw new Error("Missing actions");
  setter("a");
  setter("ab");
  setter("abc");
  save();
  await vi.waitFor(async () =>
    expect(await value(engine, "saved")).toBe("abc"),
  );
  expect(engine.evaluationRevision("saved")).toBe(4);
  expect(engine.evaluationRevision(undefined)).toBe(0);
  expect(engine.evaluationRevision("uncached")).toBe(0);
});
it("tracks conditional dependencies as their branches change", async () => {
  const engine = create();
  engine.declare("const [flag,setFlag]=DIL.useState(true)");
  engine.declare("const [left,setLeft]=DIL.useState(1)");
  engine.declare("const [right,setRight]=DIL.useState(10)");
  expect(await value(engine, "flag ? left : right")).toBe(1);
  const right = await value(engine, "setRight");
  const flag = await value(engine, "setFlag");
  if (typeof right !== "function" || typeof flag !== "function")
    throw new Error("Missing actions");
  const signature = engine.signature(
    ["flag ? left : right"],
    {},
    engine.store.getState(),
  );
  right(20);
  await vi.waitFor(async () => expect(await value(engine, "right")).toBe(20));
  expect(
    engine.signature(["flag ? left : right"], {}, engine.store.getState()),
  ).toBe(signature);
  flag(false);
  await vi.waitFor(async () =>
    expect(await value(engine, "flag ? left : right")).toBe(20),
  );
  right(30);
  await vi.waitFor(async () =>
    expect(await value(engine, "flag ? left : right")).toBe(30),
  );
});
it("discards a delayed evaluation invalidated by a newer interaction", async () => {
  const engine = create();
  engine.declare("const [n,setN]=DIL.useState(0)");
  expect(await value(engine, "n")).toBe(0);
  const setter = await value(engine, "setN");
  if (typeof setter !== "function") throw new Error("Missing setter");
  const facade = facades.at(-1);
  if (!facade) throw new Error("Missing transport");
  const deliver = facade.onmessage;
  let held: { data: unknown } | undefined;
  let newer = false;
  facade.onmessage = (event) => {
    const data = event.data;
    if (
      data &&
      typeof data === "object" &&
      "value" in data &&
      data.value === 1 &&
      "revision" in data &&
      data.revision === 1
    ) {
      held = event;
      return;
    }
    deliver?.(event);
    if (
      data &&
      typeof data === "object" &&
      "changed" in data &&
      data.changed &&
      "revision" in data &&
      data.revision === 2
    )
      newer = true;
  };
  setter(1);
  await vi.waitFor(() => {
    engine.evaluate("n");
    expect(held).toBeDefined();
  });
  setter(2);
  await vi.waitFor(() => expect(newer).toBe(true));
  if (held) deliver?.(held);
  await vi.waitFor(async () => expect(await value(engine, "n")).toBe(2));
});
async function value(
  engine: ExpressionEngine,
  source: string,
  scope: Record<string, unknown> = {},
) {
  for (let i = 0; i < 300; i++) {
    try {
      return engine.evaluate(source, scope);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.startsWith("Waiting for isolated")
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  throw new Error("Evaluation did not settle");
}
it("bridges values, callbacks and scoped records without executing source in the renderer", async () => {
  const engine = create();
  engine.declare("const [n,setN]=DIL.useState(2)");
  engine.declare("const doubled=n*2");
  expect(await value(engine, "doubled")).toBe(4);
  expect(engine.evaluate("doubled")).toBe(4);
  const callback = await value(engine, "v=>setN(v)");
  if (typeof callback !== "function") throw new Error("No handler");
  callback(7);
  await vi.waitFor(async () => expect(await value(engine, "doubled")).toBe(14));
  expect(
    await value(engine, "items.map(x=>({value:x,label:String(x)}))", {
      items: [1, 2],
    }),
  ).toEqual([
    { value: 1, label: "1" },
    { value: 2, label: "2" },
  ]);
  expect(
    engine.signature(["doubled"], {}, engine.store.getState()),
  ).toBeTruthy();
  await expect(value(engine, "missing")).rejects.toThrow();
});
it("fails closed on a malformed declaration and remains isolated from other instances", async () => {
  const broken = create(),
    healthy = create();
  broken.declare("let unsupported=1");
  await expect(value(broken, "1")).rejects.toThrow();
  expect(await value(healthy, "2")).toBe(2);
  broken.dispose();
  expect(() => broken.evaluate("3")).toThrow("disposed");
});
it("applies syntax batches without remapping existing children or replaying stale revisions", async () => {
  const doc = new DilDocument();
  engines.push(doc.engine);
  const parser = new DilParser();
  doc.apply(
    parser.append(
      "<box padding={4}><text>One</text><text>Two</text></box>",
      true,
    ),
  );
  const batch = parser.append("", true);
  doc.apply(batch);
  doc.apply(batch);
  expect(doc.node(0).getState().children.length).toBe(1);
  expect(doc.status.getState().complete).toBe(true);
  expect(() => doc.node(999)).toThrow();
  const root = doc.node(0).getState().node;
  await value(doc.engine, "4");
  expect(
    doc.attributes(
      {
        ...root,
        attributes: {
          literal: { literal: true },
          computed: { expression: "4" },
        },
      },
      {},
    ),
  ).toEqual({ literal: true, computed: 4 });
});
it("keeps persistent child pages immutable across appends", () => {
  const first = new ChildList().append(
    Array.from({ length: 128 }, (_, i) => i),
  );
  const next = first.append([128, 129]);
  expect(first.length).toBe(128);
  expect(next.get(129)).toBe(129);
  expect(next.toArray().length).toBe(130);
  expect(next.append([])).toBe(next);
  expect(() => first.get(128)).toThrow();
});
it("reports presentation limits once and keeps opaque nested callback IDs as data", async () => {
  const doc = new DilDocument();
  engines.push(doc.engine);
  doc.reportRenderLimit();
  doc.reportRenderLimit();
  await Promise.resolve();
  expect(doc.status.getState().error).toContain("display limit");
  const result = await value(create(), "({toJSON:{$dilHandler:0},value:1})");
  expect(JSON.stringify(result)).toBe('{"toJSON":{"$dilHandler":0},"value":1}');
});
it("rejects oversized expressions, arrays and deeply nested results without poisoning the renderer", async () => {
  const engine = create();
  expect(() => engine.evaluate("1".repeat(65537))).toThrow("source limit");
  await expect(value(engine, "Array(10001).fill(1)")).rejects.toThrow(
    "structural limits",
  );
  await expect(
    value(engine, "(()=>{let x={};for(let i=0;i<70;i++)x={x};return x})()"),
  ).rejects.toThrow("structural limits");
  expect(await value(engine, "2+2")).toBe(4);
});
it("rejects unknown parents and lazily reuses node stores across updates", () => {
  const doc = new DilDocument();
  engines.push(doc.engine);
  const parser = new DilParser();
  doc.apply(parser.append("<box>", false));
  const root = doc.node(0);
  doc.apply(parser.append("Text</box>", true));
  expect(doc.node(0)).toBe(root);
  expect(() =>
    doc.apply({
      revision: 100,
      nodes: [],
      links: [{ parent: 999, child: 1 }],
      declarations: [],
      complete: true,
      scanned: 0,
    }),
  ).toThrow("Unknown DIL parent");
});
it("ignores stale transport replies and reports worker failures", async () => {
  const engine = create();
  const facade = facades.at(-1);
  facade?.onmessage?.({ data: { id: 999, value: "stale" } });
  expect(await value(engine, "1")).toBe(1);
  facade?.onerror?.();
  expect(() => engine.evaluate("2")).toThrow("worker failed");
});
it("applies backpressure rather than poisoning legitimate evaluation bursts", () => {
  const engine = create();
  for (let i = 0; i < 400; i++)
    expect(() => engine.evaluate(String(i))).toThrow("Waiting");
  engine.dispose();
});
it("cancels unmounted demand and keeps a bounded transport window", async () => {
  const engine = create();
  const release = engine.retain(
    Array.from({ length: 1100 }, (_, index) => String(index)),
  );
  expect(engine.stats.evaluations).toBeLessThanOrEqual(4);
  expect(engine.stats.queued).toBeLessThanOrEqual(1024);
  release();
  expect(engine.stats.queued).toBe(0);
  await vi.waitFor(() => expect(engine.stats.inFlight).toBe(0));
  expect(() => engine.read("1099")).toThrow("Waiting");
  expect(await value(engine, "2+2")).toBe(4);
});
it("terminates a stalled dispatched transport", () => {
  vi.useFakeTimers();
  const stalled = create();
  expect(() => stalled.evaluate("1")).toThrow("Waiting");
  vi.advanceTimersByTime(5001);
  expect(() => stalled.evaluate("2")).toThrow("time limit");
  vi.useRealTimers();
});
it("attributes a clipboard request to the action that made it", () => {
  const engine = create();
  const copies: unknown[] = [];
  engine.events.addEventListener("dil:copy", (event) => {
    if (event instanceof CustomEvent) copies.push(event.detail);
  });
  const reply = (data: unknown) => facades.at(-1)?.onmessage?.({ data });
  expect(() => engine.evaluate("handler")).toThrow("Waiting");
  reply({ id: 1, value: { $dilHandler: 0 }, handles: [0], copy: "ignored" });
  expect(copies).toEqual([]);
  const handler = engine.read("handler");
  if (typeof handler !== "function") throw new Error("Missing handler");
  const receipt: unknown = handler();
  if (!(receipt instanceof ActionReceipt)) throw new Error("Missing receipt");
  reply({ id: 2, copy: "configuration" });
  expect(copies).toEqual([{ text: "configuration", intent: receipt.revision }]);
});
it("ignores malformed reply fields and halts on a fatal runtime report", () => {
  const engine = create();
  const reply = (data: unknown) => facades.at(-1)?.onmessage?.({ data });
  expect(() => engine.evaluate("1")).toThrow("Waiting");
  reply({ id: 1, value: 7, handles: "12", dependencies: 5, bindings: {} });
  expect(engine.evaluate("1")).toBe(7);
  expect(engine.stats.handles).toBe(0);
  expect(() => engine.evaluate("2")).toThrow("Waiting");
  reply({ id: 2, fatal: "Maximum call stack size exceeded" });
  expect(engine.stopped).toBe(true);
  expect(() => engine.evaluate("3")).toThrow(
    "Execution stopped: Maximum call stack size exceeded",
  );
});
it("lets one trusted activation authorize only one action", () => {
  const posted: Record<string, unknown>[] = [];
  const workers: RecordingWorker[] = [];
  class RecordingWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {
      workers.push(this);
    }
    postMessage(message: Record<string, unknown>) {
      posted.push(message);
    }
    terminate() {}
  }
  vi.stubGlobal("Worker", RecordingWorker);
  const engine = create();
  const reply = (data: unknown) => workers[0]?.onmessage?.({ data });
  expect(() => engine.evaluate("handler")).toThrow("Waiting");
  reply({ id: 1, value: { $dilHandler: 0 }, handles: [0] });
  const handler = engine.read("handler");
  if (typeof handler !== "function") throw new Error("Missing handler");
  engine.markGesture();
  handler();
  reply({ id: 2 });
  handler();
  expect(
    posted.filter((message) => message.type === "call").map((m) => m.gesture),
  ).toEqual([true, false]);
});
it("reports an execution failure at the declaration boundary", async () => {
  const doc = new DilDocument();
  engines.push(doc.engine);
  doc.engine.declare("let unsupported=1");
  await expect(value(doc.engine, "1")).rejects.toThrow();
  const parser = new DilParser();
  doc.apply(parser.append("{@body const later=1}", true));
  expect(doc.status.getState().error).toBeTruthy();
});
