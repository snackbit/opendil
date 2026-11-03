// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { RenderLimit } from "../../../packages/opendil/src/dil/view/render-limit";
import { RenderBoundary } from "../../../packages/opendil/src/dil/view/render-boundary";
import { RenderBudget } from "../../../packages/opendil/src/dil/runtime/render-budget";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("does not reserve budget for an aborted render", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const model = {
    renderBudget: new RenderBudget(),
    reportRenderLimit: vi.fn(),
  };
  function Broken(): never {
    throw new Error("broken component");
  }
  await act(() =>
    root.render(
      createElement(RenderBoundary, {
        revision: "1",
        streaming: false,
        children: createElement(RenderLimit, {
          document: model,
          cost: 100,
          children: createElement(Broken),
        }),
      }),
    ),
  );
  expect(model.renderBudget.used).toBe(0);
  expect(host.textContent).toContain("broken component");
  await act(() => root.unmount());
  host.remove();
});
it("releases committed leases before replacement and on unmount", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const model = {
    renderBudget: new RenderBudget(5),
    reportRenderLimit: vi.fn(),
  };
  await act(() =>
    root.render(
      createElement(RenderLimit, {
        document: model,
        cost: 3,
        children: "View",
      }),
    ),
  );
  expect(model.renderBudget.used).toBe(3);
  await act(() =>
    root.render(
      createElement(RenderLimit, {
        document: model,
        cost: 4,
        children: "Updated",
      }),
    ),
  );
  expect(model.renderBudget.used).toBe(4);
  expect(model.reportRenderLimit).not.toHaveBeenCalled();
  await act(() => root.unmount());
  expect(model.renderBudget.used).toBe(0);
  host.remove();
});
