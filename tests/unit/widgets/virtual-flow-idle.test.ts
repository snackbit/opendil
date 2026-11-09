// @vitest-environment happy-dom
import { act, createElement, Profiler } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DilParser } from "../../../packages/opendil/src/dil/parser/dil-parser";
import { DilDocument } from "../../../packages/opendil/src/dil/runtime/document";
import { NodeView } from "../../../packages/opendil/src/dil/view/node-view";
import { VirtualFlow } from "../../../packages/opendil/src/dil/view/virtual-flow";
import {
  RendererEnvironmentContext,
  type RendererViewport,
} from "../../../packages/opendil/src/dil/renderer-environment";

/*
 * virtual-flow-idle.test.ts: a flow short enough to render every child has no
 * scroll positions, so scrolling the page must not reach it at all.
 */
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function viewport() {
  const listeners = new Set<() => void>();
  const view: RendererViewport & { listeners: Set<() => void> } = {
    listeners,
    offset: 0,
    height: 800,
    width: 600,
    origin: () => 0,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    scrollTo() {},
  };
  return view;
}
async function mount(source: string, view: RendererViewport) {
  const model = new DilDocument();
  model.apply(new DilParser().append(source, true));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let renders = 0;
  await act(() =>
    root.render(
      createElement(
        RendererEnvironmentContext.Provider,
        { value: { viewport: view } },
        createElement(
          Profiler,
          { id: "flow", onRender: () => renders++ },
          createElement(NodeView, { id: 0, document: model }),
        ),
      ),
    ),
  );
  return {
    renders: () => renders,
    async unmount() {
      await act(() => root.unmount());
      model.engine.dispose();
      container.remove();
    },
  };
}
it("subscribes a short flow to no scroll, resize or layout signal, and scrolling renders nothing", async () => {
  const observe = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = observe;
      unobserve() {}
      disconnect() {}
    },
  );
  const resize = vi.spyOn(window, "addEventListener");
  const view = viewport();
  const flow = await mount(
    Array.from({ length: 20 }, (_, index) => `Paragraph ${index}.`).join(
      "\n\n",
    ),
    view,
  );
  expect(view.listeners.size).toBe(0);
  expect(observe).not.toHaveBeenCalledWith(document.body);
  expect(resize.mock.calls.some(([type]) => type === "resize")).toBe(false);
  const before = flow.renders();
  await act(() => {
    for (const listener of view.listeners) listener();
    window.dispatchEvent(new Event("scroll"));
  });
  expect(flow.renders()).toBe(before);
  await flow.unmount();
});
it("keeps a long flow's positions current, ignoring subpixel movement", async () => {
  const view = viewport();
  const flow = await mount(
    Array.from({ length: 150 }, (_, index) => `Line ${index}.`).join("\n\n"),
    view,
  );
  expect(view.listeners.size).toBeGreaterThan(0);
  const before = flow.renders();
  view.origin = () => 0.2;
  await act(() => {
    for (const listener of view.listeners) listener();
  });
  // The margin moved by less than half a pixel; only the virtualizer's own
  // offset notification may render.
  const subpixel = flow.renders() - before;
  view.origin = () => -40;
  await act(() => {
    for (const listener of view.listeners) listener();
  });
  expect(flow.renders() - before).toBeGreaterThan(subpixel);
  await flow.unmount();
});
it("replaces a pending row's estimate when its same-height content becomes ready", async () => {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(320);
  const model = new DilDocument();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const view = viewport();
  const show = (pending: boolean) =>
    act(() =>
      root.render(
        createElement(
          RendererEnvironmentContext.Provider,
          { value: { viewport: view } },
          createElement(VirtualFlow, {
            count: 150,
            document: model,
            scope: {},
            instance: "measured",
            renderItem: (index) =>
              index === 0 && pending
                ? createElement("div", { "data-dil-pending": "true" })
                : createElement("button", null, "Ready " + index),
          }),
        ),
      ),
    );
  const second = () =>
    container.querySelector<HTMLElement>('[data-virtual-index="1"]');
  try {
    await show(true);
    expect(second()?.style.transform).toBe("translateY(140px)");
    await show(false);
    expect(container.querySelector("[data-dil-pending]")).toBeNull();
    expect(second()?.style.transform).toBe("translateY(320px)");
  } finally {
    await act(() => root.unmount());
    model.engine.dispose();
    container.remove();
  }
});
