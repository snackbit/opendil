// @vitest-environment happy-dom
import { act, createElement, useRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSettledSignal } from "../../packages/opendil/src/dil/document-settled";
import type { RendererViewport } from "../../packages/opendil/src/dil/renderer-environment";
import { DilDocument } from "../../packages/opendil/src/dil/runtime/document";

/*
 * document-settled.test.ts: a finished answer settles once what the reader
 * can see is final. A lazily loaded widget out of view keeps its reserved
 * height and does not hold the answer, so a restored conversation is not
 * kept waiting on a diagram nobody sees yet.
 */
let mount: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mount = document.createElement("div");
  document.body.append(mount);
  root = createRoot(mount);
});
afterEach(async () => {
  await act(() => root.unmount());
  mount.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A visible area of 300 px at `offset` from the renderer's top. */
function viewportAt(offset: number): RendererViewport {
  return {
    offset,
    height: 300,
    width: 640,
    origin: () => 0,
    subscribe: () => () => {},
    scrollTo() {},
  };
}

/**
 * Lays out the renderer at the top of the page and each placeholder at its
 * `data-top`, 120 px tall; happy-dom has no layout.
 */
function layOut() {
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (this.dataset.top !== undefined) {
        const top = Number(this.dataset.top);
        return { top, bottom: top + 120, width: 640, height: 120 } as DOMRect;
      }
      return this.dataset.renderer !== undefined
        ? ({
            top: 0,
            bottom: 2000,
            width: Number(this.dataset.width ?? 640),
            height: 2000,
          } as DOMRect)
        : original.call(this);
    },
  );
}

const frame = () =>
  act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(0))));

function Harness({
  document,
  viewport,
  reports,
  children,
}: {
  document: DilDocument;
  viewport: RendererViewport;
  reports: { settled: () => void; widgetsLaidOut: () => void };
  children: ReactNode;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [stable] = useState(() => reports);
  useSettledSignal(element, document, stable, true, viewport);
  return createElement("div", { ref: element, "data-renderer": "" }, children);
}

function placeholder(top: number, name: string | undefined) {
  return createElement("div", {
    key: top,
    "data-dil-pending": "true",
    "data-dil-pending-name": name,
    "data-top": top,
  });
}

async function show(viewport: RendererViewport, placeholders: ReactNode[]) {
  const document = new DilDocument();
  document.status.setState({ complete: true });
  const reports = { settled: vi.fn(), widgetsLaidOut: vi.fn() };
  const render = (children: ReactNode[]) =>
    act(() =>
      root.render(
        createElement(Harness, { document, viewport, reports, children }),
      ),
    );
  await render(placeholders);
  await frame();
  const renderer = mount.querySelector<HTMLElement>("[data-renderer]");
  return { document, reports, render, renderer };
}

it("settles while a lazy widget out of view still loads, and reports again once it lays out", async () => {
  layOut();
  const viewport = viewportAt(1500);
  const { reports, render, renderer } = await show(viewport, [
    placeholder(200, "Mermaid"),
  ]);
  expect(renderer?.dataset.dilSettled).toBe("true");
  expect(renderer?.dataset.dilHeld).toBeUndefined();
  expect(reports.settled).toHaveBeenCalledTimes(1);
  expect(reports.widgetsLaidOut).not.toHaveBeenCalled();
  // The widget lays out: its height is recorded for a later snapshot.
  await render([]);
  await frame();
  expect(reports.widgetsLaidOut).toHaveBeenCalledTimes(1);
  expect(reports.settled).toHaveBeenCalledTimes(1);
});

it("waits for a lazy widget in view and for a value out of view", async () => {
  layOut();
  for (const pending of [
    placeholder(1600, "Chart"),
    // A value placeholder has no reserved height; its text can move.
    placeholder(200, undefined),
  ]) {
    const viewport = viewportAt(1500);
    const { reports, render, renderer } = await show(viewport, [pending]);
    expect(renderer?.dataset.dilSettled).toBe("false");
    expect(renderer?.dataset.dilHeld).toBe("true");
    expect(reports.settled).not.toHaveBeenCalled();
    await render([]);
    await frame();
    expect(renderer?.dataset.dilSettled).toBe("true");
    expect(renderer?.dataset.dilHeld).toBeUndefined();
    expect(reports.settled).toHaveBeenCalledTimes(1);
    // Nothing was loading at settle, so nothing reports later.
    expect(reports.widgetsLaidOut).not.toHaveBeenCalled();
    await act(() => root.render(null));
  }
});

it("defers nothing while the visible area is unknown", async () => {
  layOut();
  const viewport = { ...viewportAt(0), height: 0 };
  const { renderer } = await show(viewport, [placeholder(1600, "Mermaid")]);
  expect(renderer?.dataset.dilSettled).toBe("false");
});

it("releases a resized layout hold after ResizeObserver delivery and cancels pending releases on unmount", async () => {
  layOut();
  let resized: ResizeObserverCallback | undefined;
  let observer: ResizeObserver | undefined;
  class ObservedResize extends ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      super(callback);
      resized = callback;
      observer = this;
    }
  }
  vi.stubGlobal("ResizeObserver", ObservedResize);
  const { renderer, document: documentState } = await show(viewportAt(0), [
    placeholder(100, "Chart"),
  ]);
  if (!renderer || !resized || !observer)
    throw new Error("Expected a held renderer and its resize observer");
  renderer.dataset.width = "320";
  const request = vi.spyOn(globalThis, "requestAnimationFrame");
  resized([], observer);
  resized([], observer);
  expect(request).toHaveBeenCalledTimes(1);
  expect(renderer.dataset.dilHeld).toBe("true");
  await frame();
  expect(renderer.dataset.dilHeld).toBeUndefined();
  expect(renderer.style.height).toBe("");
  await act(() => root.render(null));
  documentState.engine.dispose();

  const next = await show(viewportAt(0), [placeholder(100, "Chart")]);
  if (!next.renderer || !resized || !observer)
    throw new Error("Expected another held renderer");
  next.renderer.dataset.width = "320";
  request.mockClear();
  resized([], observer);
  const queued = request.mock.results.at(-1)?.value;
  expect(request).toHaveBeenCalledTimes(1);
  expect(queued).toBeDefined();
  const cancel = vi.spyOn(globalThis, "cancelAnimationFrame");
  await act(() => root.render(null));
  expect(cancel).toHaveBeenCalledWith(queued);
  next.document.engine.dispose();
});

it("settles once when execution stops with unresolved placeholders", async () => {
  layOut();
  const { document, reports, renderer } = await show(viewportAt(0), [
    placeholder(100, undefined),
    placeholder(200, "Chart"),
  ]);
  expect(renderer?.dataset.dilSettled).toBe("false");
  document.console = false;
  await act(() =>
    document.engine.halt("Runtime blocked", "runtime", "wasm-blocked"),
  );
  await frame();
  expect(renderer?.dataset.dilSettled).toBe("true");
  expect(renderer?.dataset.dilHeld).toBeUndefined();
  expect(reports.settled).toHaveBeenCalledOnce();
  await frame();
  expect(reports.settled).toHaveBeenCalledOnce();
  expect(reports.widgetsLaidOut).not.toHaveBeenCalled();
  document.engine.dispose();
});
