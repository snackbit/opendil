// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { Worker as Thread } from "node:worker_threads";
import { act, createElement, Fragment, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MessageRenderer } from "../../packages/opendil/src/dil/message-renderer";
import {
  clearDocumentCache,
  preloadHostRenderer,
} from "../../packages/opendil/src";
import {
  clearDocumentCache as clearCache,
  SNAPSHOT_VERSION,
  sourceHash,
  type DilSnapshot,
} from "../../packages/opendil/src/dil/document-cache";
import { DilParser } from "../../packages/opendil/src/dil/parser/dil-parser";

/*
 * document-cache.test.ts: a finished answer that mounts again, as after
 * virtualization, a session switch or a reload, shows its final values in
 * its first commit. Runs against the real QuickJS worker build.
 */
const VM = readFileSync("packages/opendil/dist/test/vm.js", "utf8");
const runtimes: QuickJSWorker[] = [];
class QuickJSWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  posted: Array<Record<string, unknown>> = [];
  terminated = false;
  private readonly thread = new Thread(
    `const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=data=>parentPort.postMessage(data);${VM};parentPort.on('message',data=>self.onmessage({data}));`,
    { eval: true },
  );
  constructor() {
    runtimes.push(this);
    this.thread.on("message", (data) => this.onmessage?.({ data }));
  }
  postMessage(message: Record<string, unknown>) {
    this.posted.push(message);
    this.thread.postMessage(message);
  }
  terminate() {
    this.terminated = true;
    void this.thread.terminate();
  }
}
const jobs = () =>
  runtimes.flatMap((runtime) =>
    runtime.posted.filter((message) => message.type !== "init"),
  );
let mount: HTMLDivElement;
let root: Root;
beforeEach(() => {
  runtimes.length = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("Worker", QuickJSWorker);
  vi.stubGlobal("__DIL_VM_WORKER__", "vm");
  vi.stubGlobal("__DIL_PARSER_WORKER__", "parser");
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  mount = document.createElement("div");
  document.body.append(mount);
  root = createRoot(mount);
});
afterEach(async () => {
  await act(() => root.unmount());
  mount.remove();
  runtimes.forEach((runtime) => runtime.terminate());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const TEXT =
  "{@body const [n, setN] = DIL.useState(2)}\n\n<text>Total {n * 21}</text>\n\n<text>Roll {String(Math.random())}</text>";
async function show(props: Parameters<typeof MessageRenderer>[0]) {
  await act(() => root.render(createElement(MessageRenderer, props)));
}
async function hide() {
  await act(() => root.render(null));
}
const total = () => mount.textContent?.match(/Total (\d+)/)?.[1];
const roll = () => mount.textContent?.match(/Roll ([\d.]+)/)?.[1];
const idle = () => act(() => new Promise((resolve) => setTimeout(resolve, 80)));

it("adopts a finished answer's live document: final values in the first commit, no worker job", async () => {
  await show({ text: TEXT, cacheKey: "message:1" });
  await vi.waitFor(() => expect(total()).toBe("42"));
  const first = roll();
  await hide();
  const sent = jobs().length;
  await show({ text: TEXT, cacheKey: "message:1" });
  // In the first commit, before any reply could arrive.
  expect(total()).toBe("42");
  expect(roll()).toBe(first);
  expect(mount.querySelector("[data-dil-pending]")).toBeNull();
  await idle();
  expect(jobs()).toHaveLength(sent);
  expect(runtimes.filter((runtime) => !runtime.terminated)).toHaveLength(1);
  // Other text under the same key starts over.
  await hide();
  await show({ text: TEXT + "\n\nMore.", cacheKey: "message:1" });
  expect(total()).toBeUndefined();
  await vi.waitFor(() => expect(total()).toBe("42"));
});

it("keeps twelve idle answers alive and disposes the oldest beyond them", async () => {
  for (let index = 0; index < 13; index++) {
    await show({ text: TEXT, cacheKey: "message:" + index });
    await vi.waitFor(() => expect(total()).toBe("42"));
    await hide();
  }
  await idle();
  expect(runtimes.map((runtime) => runtime.terminated)).toEqual([
    true,
    ...Array.from({ length: 12 }, () => false),
  ]);
});

it("shows a snapshot's results in the first commit and keeps them when the runtime agrees", async () => {
  const snapshots: DilSnapshot[] = [];
  await show({ text: TEXT, onSnapshot: (value) => snapshots.push(value) });
  await vi.waitFor(() => expect(snapshots).toHaveLength(1));
  const [snapshot] = snapshots;
  if (!snapshot) throw new Error("Missing snapshot");
  expect(snapshot.sourceHash).toBe(sourceHash(TEXT));
  expect(Object.values(snapshot.values)).toContain(42);
  const recorded = roll();
  await hide();
  // A reload: JSON storage, a new renderer, no live document.
  const stored = JSON.parse(JSON.stringify(snapshot)) as DilSnapshot;
  await show({ text: TEXT, snapshot: stored });
  expect(total()).toBe("42");
  expect(roll()).toBe(recorded);
  expect(mount.querySelector("[data-dil-pending]")).toBeNull();
  // The runtime evaluates once in the background; Math.random() differs, so
  // that value is replaced, and the matching total stays.
  await vi.waitFor(() => expect(roll()).not.toBe(recorded));
  expect(total()).toBe("42");
  const replayed = runtimes.at(-1)?.posted.filter((m) => m.type === "batch");
  expect(replayed).toHaveLength(1);
});

it("ignores a snapshot of other text or another version", async () => {
  const snapshot: DilSnapshot = {
    version: SNAPSHOT_VERSION,
    sourceHash: sourceHash("other text"),
    values: { [JSON.stringify(["n * 21", {}])]: 99 },
    heights: {},
  };
  await show({ text: TEXT, snapshot });
  expect(total()).toBeUndefined();
  await vi.waitFor(() => expect(total()).toBe("42"));
  await hide();
  await show({
    text: TEXT,
    snapshot: {
      ...snapshot,
      version: SNAPSHOT_VERSION + 1,
      sourceHash: sourceHash(TEXT),
    },
  });
  expect(total()).toBeUndefined();
});

/** Lays the renderer out at a width and height; happy-dom has no layout. */
function layOut(width: number, height = 300) {
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return this.dataset.dilRenderer
        ? ({ width, height, top: 0, bottom: height } as DOMRect)
        : original.call(this);
    },
  );
}
const CHART =
  '{@body const [rows, setRows] = DIL.useState([{x: "a", y: 1}])}\n\n<Chart content={{chartType: "bar", data: rows, xKey: "x", series: [{dataKey: "y"}]}}/>\n\nAfter the chart.';
const chartId = () => {
  const parser = new DilParser();
  const chart = parser
    .append(CHART, true)
    .nodes.find((n) => n.name === "Chart");
  return String(chart?.id);
};
const reserve = () =>
  (mount.querySelector('[data-dil-pending-name="Chart"]') as HTMLElement | null)
    ?.style.minHeight;

it("reserves the widget height a snapshot measured at the renderer's width", async () => {
  const id = chartId();
  const snapshot: DilSnapshot = {
    version: SNAPSHOT_VERSION,
    sourceHash: sourceHash(CHART),
    values: {},
    heights: { "320": { [id]: 111.5 }, "900": { [id]: 222 } },
  };
  for (const [width, expected] of [
    [900, "222px"],
    [320, "111.5px"],
    // A width without its own measurement uses the nearest one.
    [600, "111.5px"],
  ] as const) {
    vi.restoreAllMocks();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    layOut(width);
    await show({ text: CHART, snapshot });
    // Before any worker reply: the first commit, after its layout.
    expect(reserve()).toBe(expected);
    await hide();
  }
});

it("mounts a chart in the first commit when a settled snapshot document is adopted", async () => {
  layOut(640);
  const id = chartId();
  const snapshot: DilSnapshot = {
    version: SNAPSHOT_VERSION,
    sourceHash: sourceHash(CHART),
    values: {},
    heights: { "640": { [id]: 222 } },
  };
  const settled = () =>
    mount.querySelector<HTMLElement>("[data-dil-renderer]")?.dataset.dilSettled;
  await show({ text: CHART, snapshot, cacheKey: "message:chart" });
  // Seeded with a recorded height: the chart waits for its mount turn.
  expect(reserve()).toBe("222px");
  await vi.waitFor(() => expect(settled()).toBe("true"));
  await hide();
  await show({ text: CHART, snapshot, cacheKey: "message:chart" });
  // The live document has its own final layout: no placeholder to replace.
  expect(reserve()).toBeUndefined();
  expect(mount.querySelector("[data-dil-pending]")).toBeNull();
});

it("holds a finished answer's first-frame height until it settles", async () => {
  layOut(640, 300);
  await show({ text: TEXT });
  const renderer = mount.querySelector<HTMLElement>("[data-dil-renderer]");
  await vi.waitFor(() => expect(renderer?.dataset.dilHeld).toBe("true"));
  expect(renderer?.style.height).toBe("300px");
  expect(renderer?.dataset.dilSettled).toBe("false");
  await vi.waitFor(() => expect(renderer?.dataset.dilSettled).toBe("true"));
  expect(total()).toBe("42");
  expect(renderer?.dataset.dilHeld).toBeUndefined();
  expect(renderer?.style.height).toBe("");
  expect(renderer?.style.overflow).toBe("");
});

it("does not hold an answer adopted from the cache, which has its final layout", async () => {
  layOut(640, 300);
  await show({ text: TEXT, cacheKey: "message:held" });
  await vi.waitFor(() =>
    expect(
      mount.querySelector<HTMLElement>("[data-dil-renderer]")?.dataset
        .dilSettled,
    ).toBe("true"),
  );
  await hide();
  await show({ text: TEXT, cacheKey: "message:held" });
  const renderer = mount.querySelector<HTMLElement>("[data-dil-renderer]");
  await vi.waitFor(() => expect(renderer?.dataset.dilSettled).toBe("true"));
  expect(renderer?.dataset.dilHeld).toBeUndefined();
  expect(renderer?.style.height).toBe("");
});

it("ends the hold when the renderer's width changes, as the held height no longer fits", async () => {
  const observers: Array<() => void> = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private readonly callback: () => void) {
        observers.push(() => this.callback());
      }
      observe() {}
      disconnect() {}
    },
  );
  layOut(640, 300);
  await show({ text: TEXT });
  const renderer = mount.querySelector<HTMLElement>("[data-dil-renderer]");
  await vi.waitFor(() => expect(renderer?.dataset.dilHeld).toBe("true"));
  // A resize that keeps the width, as the content filling in, keeps it.
  observers.forEach((notify) => notify());
  expect(renderer?.dataset.dilHeld).toBe("true");
  vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockRestore();
  layOut(480, 300);
  observers.forEach((notify) => notify());
  expect(renderer?.dataset.dilHeld).toBeUndefined();
  expect(renderer?.style.height).toBe("");
});

it("ends the hold at the reader's first input and never holds a streaming answer", async () => {
  layOut(640, 300);
  await show({ text: TEXT });
  const renderer = mount.querySelector<HTMLElement>("[data-dil-renderer]");
  await vi.waitFor(() => expect(renderer?.dataset.dilHeld).toBe("true"));
  // Scrolling over the answer keeps it held; acting in it ends the hold.
  renderer?.dispatchEvent(new Event("wheel"));
  expect(renderer?.dataset.dilHeld).toBe("true");
  renderer?.dispatchEvent(new Event("click"));
  expect(renderer?.dataset.dilHeld).toBeUndefined();
  expect(renderer?.style.height).toBe("");
  await hide();
  await show({ text: TEXT, isStreaming: true });
  await idle();
  expect(
    mount.querySelector<HTMLElement>("[data-dil-renderer]")?.dataset.dilHeld,
  ).toBeUndefined();
});

it("gives each of two renderers with one key its own document, final values in the first commit", async () => {
  await show({ text: TEXT, cacheKey: "message:pair" });
  await vi.waitFor(() => expect(total()).toBe("42"));
  await hide();
  const live = () => runtimes.filter((runtime) => !runtime.terminated);
  expect(live()).toHaveLength(1);
  // Both mount in one commit, as a dock and a detail view might.
  const pair = (count: number) =>
    act(() =>
      root.render(
        createElement(
          Fragment,
          null,
          ...Array.from({ length: count }, (_, index) =>
            createElement(MessageRenderer, {
              key: index,
              text: TEXT,
              cacheKey: "message:pair",
            }),
          ),
        ),
      ),
    );
  await pair(2);
  const totals = () =>
    [...mount.querySelectorAll("[data-dil-renderer]")].map(
      (element) => element.textContent?.match(/Total (\d+)/)?.[1],
    );
  expect(totals()).toEqual(["42", "42"]);
  expect(mount.querySelector("[data-dil-pending]")).toBeNull();
  // The second renderer's copy confirms its values with its own runtime.
  await vi.waitFor(() => expect(live()).toHaveLength(2));
  await idle();
  expect(totals()).toEqual(["42", "42"]);
  // The cache now holds the copy, so the first document goes with its renderer.
  await pair(1);
  await hide();
  await idle();
  expect(live()).toHaveLength(1);
  const sent = jobs().length;
  await show({ text: TEXT, cacheKey: "message:pair" });
  expect(total()).toBe("42");
  await idle();
  expect(jobs()).toHaveLength(sent);
});

it("keeps a streamed answer under the key it receives when it finishes", async () => {
  await show({ text: TEXT.slice(0, 40), isStreaming: true });
  await show({ text: TEXT, isStreaming: true });
  // Hosts often know a stable identity only for the finished text.
  await show({ text: TEXT, cacheKey: "message:streamed" });
  await vi.waitFor(() => expect(total()).toBe("42"));
  const first = roll();
  await hide();
  const sent = jobs().length;
  await show({ text: TEXT, cacheKey: "message:streamed" });
  expect(total()).toBe("42");
  expect(roll()).toBe(first);
  await idle();
  expect(jobs()).toHaveLength(sent);
});

it("evaluates again when the cache disposes a document between a renderer's render and its mount", async () => {
  await show({ text: TEXT, cacheKey: "message:raced" });
  await vi.waitFor(() => expect(total()).toBe("42"));
  await hide();
  // A host that clears the cache in a layout effect, as at sign-out, while an
  // answer that read the idle document during render mounts in the same commit.
  function ClearOnMount() {
    useLayoutEffect(() => clearCache(), []);
    return null;
  }
  await act(() =>
    root.render(
      createElement(
        Fragment,
        null,
        createElement(MessageRenderer, {
          text: TEXT,
          cacheKey: "message:raced",
        }),
        createElement(ClearOnMount),
      ),
    ),
  );
  await vi.waitFor(() => expect(total()).toBe("42"));
  await idle();
  expect(total()).toBe("42");
  expect(runtimes.at(-1)?.terminated).toBe(false);
});

it("evaluates again when an unmount in the same commit evicts the idle document a renderer mounts with", async () => {
  // A virtualized list: one answer scrolls out as the oldest kept one returns.
  const keyed = (key: string) =>
    act(() =>
      root.render(
        createElement(MessageRenderer, {
          key,
          text: TEXT,
          cacheKey: "message:evicted:" + key,
        }),
      ),
    );
  for (let index = 0; index < 12; index++) {
    await keyed(String(index));
    await vi.waitFor(() => expect(total()).toBe("42"));
    await hide();
  }
  await keyed("latest");
  await vi.waitFor(() => expect(total()).toBe("42"));
  await keyed("0");
  await vi.waitFor(() => expect(total()).toBe("42"));
  await idle();
  expect(total()).toBe("42");
});

// Last: loading the host code boots a spare runtime for every later answer.
it("clearDocumentCache drops idle answers now and answers on screen when they unmount", async () => {
  await preloadHostRenderer();
  const working = () =>
    runtimes.filter((runtime) =>
      runtime.posted.some((message) => message.type !== "init"),
    );
  await show({ text: TEXT, cacheKey: "message:cleared" });
  await vi.waitFor(() => expect(total()).toBe("42"));
  await hide();
  clearDocumentCache();
  expect(working().map((runtime) => runtime.terminated)).toEqual([true]);
  // The next renderer with the key evaluates again instead of adopting it.
  await show({ text: TEXT, cacheKey: "message:cleared" });
  expect(total()).toBeUndefined();
  await vi.waitFor(() => expect(total()).toBe("42"));
  clearDocumentCache();
  await idle();
  expect(total()).toBe("42");
  expect(working().map((runtime) => runtime.terminated)).toEqual([true, false]);
  await hide();
  await idle();
  expect(working().map((runtime) => runtime.terminated)).toEqual([true, true]);
});
