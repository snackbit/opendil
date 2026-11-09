// @vitest-environment happy-dom
import { Activity, act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IsolatedRenderer } from "../../packages/opendil/src/dil/isolation/isolated-renderer";
import { UNREPORTED_PROBLEMS } from "../../packages/opendil/src/dil/render-error";
import {
  READY_AFTER_LOAD_MS,
  SILENT_FRAME_MS,
} from "../../packages/opendil/src/dil/isolation/frame-startup";

// The renderer's half of the frame handshake.
let mount: HTMLDivElement;
let root: Root;
let posted: { data: unknown; ports: MessagePort[] }[];
let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  // The frame window is opaque to the renderer; a stand-in records its messages.
  const windows = new WeakMap<HTMLIFrameElement, object>();
  vi.spyOn(
    HTMLIFrameElement.prototype,
    "contentWindow",
    "get",
  ).mockImplementation(function (this: HTMLIFrameElement) {
    let target = windows.get(this);
    if (!target) {
      target = {
        postMessage(data: unknown, options?: { transfer?: MessagePort[] }) {
          posted.push({ data, ports: options?.transfer ?? [] });
        },
      };
      windows.set(this, target);
    }
    return target as Window;
  });
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  posted = [];
  // Detached, so the test DOM does not try to navigate the iframe.
  mount = document.createElement("div");
  root = createRoot(mount);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function render(visible = true, runtimeBaseUrl = "/startup-test/") {
  act(() =>
    root.render(
      createElement(Activity, {
        mode: visible ? "visible" : "hidden",
        children: createElement(IsolatedRenderer, {
          text: "# Hello",
          runtimeBaseUrl,
        }),
      }),
    ),
  );
  const frame = mount.querySelector("iframe");
  if (!frame) throw new Error("Missing frame");
  return frame;
}
function fromFrame(frame: HTMLIFrameElement, data: unknown) {
  act(() =>
    window.dispatchEvent(
      new MessageEvent("message", {
        data,
        origin: "null",
        source: frame.contentWindow,
      }),
    ),
  );
}
const inits = () =>
  posted.filter(({ data }) => (data as { type?: unknown }).type === "dil-init");
const alert = () => mount.querySelector('[role="alert"]')?.textContent ?? "";
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

it("keeps waiting for a frame that pings while frame.js downloads", () => {
  const frame = render();
  fromFrame(frame, { type: "dil-loading" });
  advance(SILENT_FRAME_MS * 2);
  expect(alert()).toBe("");
  expect(errors).not.toHaveBeenCalled();
  expect(frame.style.display).toBe("block");
  fromFrame(frame, { type: "dil-ready", version: "x", instance: "a" });
  expect(inits()).toHaveLength(1);
});

it("reports a frame that never sends anything", () => {
  const frame = render(true, "/silent/");
  advance(SILENT_FRAME_MS - 1);
  expect(alert()).toBe("");
  advance(1);
  expect(alert()).toContain("http://localhost:3000/silent/frame.html");
  expect(alert()).toContain("npx opendil copy-assets");
  expect(frame.style.display).toBe("none");
  expect(errors).toHaveBeenCalledTimes(1);
  // A late frame still recovers.
  fromFrame(frame, { type: "dil-ready", instance: "late" });
  expect(alert()).toBe("");
  expect(frame.style.display).toBe("block");
});

it("reports a frame.js that failed to load at once", () => {
  const frame = render(true, "/failed/");
  fromFrame(frame, { type: "dil-loading" });
  fromFrame(frame, { type: "dil-failed" });
  expect(alert()).toContain("/failed/frame.html");
});

it("reports a loaded page that never announces itself", () => {
  const frame = render(true, "/not-opendil/");
  act(() => frame.dispatchEvent(new Event("load")));
  advance(READY_AFTER_LOAD_MS - 1);
  expect(alert()).toBe("");
  advance(1);
  expect(alert()).toContain("/not-opendil/frame.html");
});

it("ignores repeated announcements and reconnects a reloaded document", () => {
  const frame = render();
  fromFrame(frame, { type: "dil-ready", instance: "a" });
  fromFrame(frame, { type: "dil-ready", instance: "a" });
  expect(inits()).toHaveLength(1);
  fromFrame(frame, { type: "dil-ready", instance: "b" });
  expect(inits()).toHaveLength(2);
});

it("reconnects to the same frame document after <Activity> hides and shows it", async () => {
  const frame = render();
  fromFrame(frame, { type: "dil-ready", instance: "a" });
  expect(inits()).toHaveLength(1);
  render(false);
  render(true);
  // The restarted effect asks the mounted document to announce itself again.
  expect(posted.at(-1)?.data).toEqual({ type: "dil-hello" });
  fromFrame(frame, { type: "dil-ready", instance: "a" });
  expect(inits()).toHaveLength(2);
  advance(SILENT_FRAME_MS * 2);
  expect(alert()).toBe("");
  expect(errors).not.toHaveBeenCalled();
  // The new channel carries the full source and its replies reach the renderer.
  const port = inits()[1]?.ports[0];
  if (!port) throw new Error("Missing transferred port");
  const received: unknown[] = [];
  port.onmessage = (event) => received.push(event.data);
  vi.useRealTimers();
  port.postMessage({ type: "height", height: 64 });
  await vi.waitFor(() => expect(frame.style.height).toBe("64px"));
  await vi.waitFor(() =>
    expect(received).toContainEqual(
      expect.objectContaining({ type: "source", suffix: "# Hello" }),
    ),
  );
  port.close();
});

it("forwards validated errors and completion details from the frame", async () => {
  const reported: unknown[] = [];
  const commits: unknown[] = [];
  const show = (text: string, isStreaming: boolean) =>
    act(() =>
      root.render(
        createElement(IsolatedRenderer, {
          text,
          isStreaming,
          runtimeBaseUrl: "/forward/",
          onError: (error) => reported.push(error),
          onCommit: (detail) => commits.push(detail),
        }),
      ),
    );
  await show("<grid>", true);
  const frame = mount.querySelector("iframe");
  if (!frame) throw new Error("Missing frame");
  fromFrame(frame, { type: "dil-ready", instance: "a" });
  const port = inits()[0]?.ports[0];
  if (!port) throw new Error("Missing transferred port");
  const received: unknown[] = [];
  port.onmessage = (event) => received.push(event.data);
  vi.useRealTimers();
  // The frame is untrusted: malformed errors are dropped.
  port.postMessage({ type: "error", error: { kind: "fatal", message: "x" } });
  port.postMessage({
    type: "error",
    error: { kind: "syntax", message: "Bad", offset: -2 },
  });
  port.postMessage({ type: "error", error: "Cut" });
  port.postMessage({
    type: "error",
    error: {
      kind: "incomplete",
      code: "unfinished-structure",
      message: "Cut",
      offset: 0,
    },
  });
  port.postMessage({
    type: "commit",
    detail: { scanned: 6, complete: true, incomplete: true },
  });
  // Frames copied from earlier releases send no incomplete flag.
  port.postMessage({ type: "commit", detail: { scanned: 6, complete: true } });
  await vi.waitFor(() => expect(commits).toHaveLength(2));
  expect(reported).toEqual([
    {
      kind: "incomplete",
      code: "unfinished-structure",
      message: "Cut",
      offset: 0,
    },
  ]);
  expect(commits).toEqual([
    { scanned: 6, complete: true, incomplete: true },
    { scanned: 6, complete: true, incomplete: false },
  ]);

  // Stopping without new text still tells the frame the message is final.
  await show("<grid>", false);
  await vi.waitFor(() =>
    expect(received).toContainEqual(
      expect.objectContaining({
        type: "source",
        suffix: "",
        isStreaming: false,
      }),
    ),
  );
  // Errors found outside the frame reach the same callback.
  await show("<gr", false);
  await vi.waitFor(() =>
    expect(reported).toContainEqual({
      kind: "source",
      code: "source-replaced",
      message: "Start a new message instance before replacing its source.",
    }),
  );
  port.close();
});

it("bounds the errors a frame can report", async () => {
  const reported: unknown[] = [];
  await act(() =>
    root.render(
      createElement(IsolatedRenderer, {
        text: "<grid>",
        isStreaming: true,
        runtimeBaseUrl: "/flood/",
        onError: (error) => reported.push(error),
      }),
    ),
  );
  const frame = mount.querySelector("iframe");
  if (!frame) throw new Error("Missing frame");
  fromFrame(frame, { type: "dil-ready", instance: "a" });
  const port = inits()[0]?.ports[0];
  if (!port) throw new Error("Missing transferred port");
  vi.useRealTimers();
  // A frame that ignores its own budget still reaches onError a bounded number of times.
  for (let offset = 1; offset <= 100; offset++)
    port.postMessage({
      type: "error",
      error: { kind: "syntax", message: "Flood", offset },
    });
  for (const message of ["Cut", "Again"])
    port.postMessage({
      type: "error",
      error: { kind: "incomplete", message, offset: 0 },
    });
  port.postMessage({ type: "commit", detail: { scanned: 6, complete: true } });
  await vi.waitFor(() => expect(reported).toHaveLength(22));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(reported).toEqual([
    ...Array.from({ length: 20 }, (_, index) => ({
      kind: "syntax",
      code: "unclassified",
      message: "Flood",
      offset: index + 1,
    })),
    { kind: "limit", code: "problem-limit", message: UNREPORTED_PROBLEMS },
    { kind: "incomplete", code: "unclassified", message: "Cut", offset: 0 },
  ]);
  port.close();
});

it("reports a runtime frame that never starts through onError", () => {
  const reported: unknown[] = [];
  act(() =>
    root.render(
      createElement(IsolatedRenderer, {
        text: "# Hello",
        runtimeBaseUrl: "/missing-runtime/",
        onError: (error) => reported.push(error),
      }),
    ),
  );
  advance(SILENT_FRAME_MS);
  expect(reported).toEqual([
    {
      kind: "runtime",
      code: "frame-startup-failed",
      message: expect.stringContaining("/missing-runtime/frame.html"),
    },
  ]);
});
