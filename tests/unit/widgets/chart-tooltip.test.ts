// @vitest-environment happy-dom
import { act, createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  OverlayRoomContext,
  UiScope,
} from "../../../packages/opendil/src/components/ui/overlays/ui-scope";
import { ChartPointTooltip } from "../../../packages/opendil/src/dil/widgets/charts/chart-point-tooltip";
import { CartesianPlot } from "../../../packages/opendil/src/dil/widgets/charts/plot/cartesian-plot";
import { SnapTooltip } from "../../../packages/opendil/src/dil/widgets/charts/snap-tooltip";
import {
  ChartInteractionContext,
  createChartInteraction,
} from "../../../packages/opendil/src/dil/widgets/charts/chart-interaction";

let host: HTMLDivElement, root: Root;
const AREA = { left: 100, top: 50, width: 200, height: 70 };
let tooltipBox = { left: 0, top: -80, width: 100, height: 40 };
const measurements: HTMLElement[] = [];
const caught = vi.fn();
const close = vi.fn();
const observers: { notify(): void; disconnect: ReturnType<typeof vi.fn> }[] =
  [];
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect = vi.fn();
      observe = vi.fn();
      constructor(notify: () => void) {
        observers.push({ notify, disconnect: this.disconnect });
      }
    },
  );
  // happy-dom has no layout: an 800 by 600 viewport and a 100 by 40 tooltip,
  // parked twice its height above its containing block until it opens.
  tooltipBox = { left: 0, top: -80, width: 100, height: 40 };
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(800);
  vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(
    600,
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      measurements.push(this);
      const box = this.getAttribute("role") === "tooltip" ? tooltipBox : AREA;
      return new DOMRect(box.left, box.top, box.width, box.height);
    },
  );
  measurements.length = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host, { onCaughtError: caught });
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  observers.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const tip = () => host.querySelector('[role="tooltip"]');
async function show(open = true, x = 10, boundary?: Element, y = 30) {
  await act(() =>
    root.render(
      createElement(
        UiScope,
        boundary ? { boundary } : {},
        createElement(ChartPointTooltip, {
          open,
          x,
          y,
          onClose: close,
          children: "East 120",
        }),
      ),
    ),
  );
}
const placed = () => tip()?.getAttribute("style") ?? "";

it("prepares a hidden tooltip, opens it without taking focus, and dismisses local pointer interaction", async () => {
  await show(false);
  expect(tip()?.getAttribute("aria-hidden")).toBe("true");
  // A chart nobody hovers measures nothing, however often it renders.
  await show(false, 11);
  expect(measurements).toEqual([]);
  const queuedScroll = new Event("scroll");
  await show();
  expect(tip()?.getAttribute("aria-hidden")).toBe("false");
  expect(placed()).toContain("translate(10px, 42px)");
  expect(placed()).toContain("visibility: visible");
  expect(tip()?.getAttribute("data-side")).toBe("bottom");
  expect(document.activeElement).toBe(document.body);
  // Focusing a chart can queue a scroll before its keyboard tooltip opens.
  // Its delayed delivery must not dismiss that newer selection.
  window.dispatchEvent(queuedScroll);
  expect(close).not.toHaveBeenCalled();
  await act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
  });
  expect(close).not.toHaveBeenCalled();
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  window.dispatchEvent(new Event("pointerdown"));
  window.dispatchEvent(new Event("scroll"));
  expect(close).toHaveBeenCalledTimes(3);
  await show(false);
  expect(placed()).toContain("translate(0, -200%)");
  expect(placed()).toContain("visibility: hidden");
  expect(
    observers.some((observer) => observer.disconnect.mock.calls.length),
  ).toBe(true);
});

it("follows the pointer with one measurement per opening and measures again after a resize", async () => {
  await show();
  expect(measurements).toHaveLength(1);
  await show(true, 60);
  await show(true, 90);
  expect(placed()).toContain("translate(90px, 42px)");
  expect(measurements).toHaveLength(1);
  // New values widened it: it no longer fits right of the pointer.
  tooltipBox = { left: 90, top: 42, width: 760, height: 40 };
  await act(() => observers.at(-1)?.notify());
  expect(placed()).toContain("translate(32px, 42px)");
  tooltipBox = { left: 32, top: 42, width: 100, height: 40 };
  await act(() => window.dispatchEvent(new Event("resize")));
  expect(placed()).toContain("translate(90px, 42px)");
  // Closed, a resize has nothing to place.
  await show(false);
  tooltipBox = { left: 0, top: -80, width: 100, height: 40 };
  measurements.length = 0;
  await act(() => observers.at(-1)?.notify());
  expect(measurements).toEqual([]);
  expect(placed()).toContain("translate(0, -200%)");
});

it("stays inside its boundary: above the pointer when that overflows less, and clear of the edges", async () => {
  // A transformed ancestor contains it: its untransformed corner is at 20, 10.
  tooltipBox = { left: 20, top: -70, width: 100, height: 40 };
  // The area ends at 300 by 120, less 8 px of padding.
  await show(true, 250, document.body, 100);
  expect(placed()).toContain("translate(172px, 38px)");
  expect(tip()?.getAttribute("data-side")).toBe("top");
  await show(false, 250, document.body, 100);
  // Above would overflow by more than below does.
  await show(true, 90, document.body, 70);
  expect(placed()).toContain("translate(88px, 72px)");
  expect(tip()?.getAttribute("data-side")).toBe("bottom");
});

it("uses the room an isolated frame grows below its viewport", async () => {
  const room = { below: () => 60, subscribe: () => () => {} };
  await act(() =>
    root.render(
      createElement(
        OverlayRoomContext.Provider,
        { value: room },
        createElement(
          UiScope,
          { boundary: document.body },
          createElement(ChartPointTooltip, {
            open: true,
            x: 150,
            y: 100,
            onClose: close,
            children: "East",
          }),
        ),
      ),
    ),
  );
  // The area then ends at 172: the 40 px fit below the pointer at 100.
  expect(placed()).toContain("translate(150px, 112px)");
  expect(tip()?.getAttribute("data-side")).toBe("bottom");
});

it("does not place a tooltip outside a renderer portal scope", async () => {
  await act(() =>
    root.render(
      createElement(ChartPointTooltip, {
        open: true,
        x: 1,
        y: 2,
        onClose: close,
        children: null,
      }),
    ),
  );
  expect(tip()).toBeNull();
  expect(measurements).toEqual([]);
});

it("resolves current rows for category, scatter and slice tooltips without storing them in hover state", async () => {
  const interaction = createChartInteraction();
  const items = [
    { id: "east", label: "East", color: "red" },
    { id: "west", label: "West", color: "blue" },
    { id: "invalid", label: "Ignored", color: "gray" },
  ];
  let rows: Record<string, unknown>[] = [
    { time: "10:00", east: 120, west: 145, invalid: false, value: 45 },
  ];
  const render = async (
    kind: "category" | "scatter" | "slice",
    visible = items,
  ) => {
    await act(() =>
      root.render(
        createElement(
          UiScope,
          null,
          createElement(
            ChartInteractionContext.Provider,
            { value: interaction },
            createElement(SnapTooltip, {
              rows,
              items: visible,
              kind,
              xKey: "time",
              valueKey: "value",
            }),
          ),
        ),
      ),
    );
  };
  await render("category");
  expect(tip()?.getAttribute("aria-hidden")).toBe("true");
  await act(() =>
    interaction.hover({
      target: { id: "east", index: 0 },
      clientX: 20,
      clientY: 30,
    }),
  );
  expect(tip()?.textContent).toContain("10:00");
  expect(tip()?.textContent).toContain("East120");
  expect(tip()?.textContent).toContain("West145");
  expect(tip()?.textContent).not.toContain("Ignored");
  expect(
    tip()?.querySelector('[data-emphasized="true"]')?.textContent,
  ).toContain("East");
  rows = [
    { time: 20, east: 240, west: "unavailable", invalid: null, value: 55 },
  ];
  await render("scatter");
  expect(tip()?.textContent).toContain("time20");
  expect(tip()?.textContent).toContain("East240");
  await render("slice", items.slice(0, 1));
  expect(tip()?.textContent).toContain("East55");
  expect(tip()?.querySelector('[data-emphasized="true"]')).toBeNull();
  await act(() => interaction.hover(null));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  rows = [{ time: false }];
  await render("scatter");
  await act(() =>
    interaction.hover({
      target: { id: "missing", index: 0 },
      clientX: 20,
      clientY: 30,
    }),
  );
  expect(tip()?.getAttribute("aria-hidden")).toBe("true");
  rows = [];
  await act(() => interaction.hover(null));
  await render("category", []);
  expect(tip()?.textContent).toBe("");
});

it.each([
  { scatter: false, name: "line" },
  { scatter: true, name: "scatter" },
])(
  "closes a $name tooltip when its hovered point disappears without changing identities",
  async ({ scatter }) => {
    const interaction = createChartInteraction();
    const items = [{ id: "east", label: "East", color: "red" }];
    const render = async (value: number | null, time = 20) => {
      const rows = [{ time, east: value }];
      await act(() =>
        root.render(
          createElement(
            UiScope,
            null,
            createElement(
              ChartInteractionContext.Provider,
              { value: interaction },
              createElement(
                Fragment,
                null,
                createElement(CartesianPlot, {
                  type: scatter ? "scatter" : "line",
                  width: 400,
                  height: 248,
                  rows,
                  items,
                  hidden: new Set<string>(),
                  xKey: "time",
                  xLabel: "",
                  yLabel: "",
                }),
                createElement(SnapTooltip, {
                  rows,
                  items,
                  kind: scatter ? "scatter" : "category",
                  xKey: "time",
                  valueKey: "",
                }),
              ),
            ),
          ),
        ),
      );
    };
    await render(120);
    interaction.reconcile(["east"], 1);
    await act(() =>
      interaction.hover({
        target: { id: "east", index: 0 },
        clientX: 20,
        clientY: 30,
      }),
    );
    expect(tip()?.getAttribute("aria-hidden")).toBe("false");
    expect(host.querySelector("[data-chart-snapped-index]")).not.toBeNull();
    const notify = vi.fn();
    interaction.store.subscribe(notify);
    await render(145, 30);
    expect(tip()?.textContent).toContain("East145");
    expect(notify).not.toHaveBeenCalled();
    await render(null, 30);
    expect(tip()?.getAttribute("aria-hidden")).toBe("true");
    expect(host.querySelector("[data-chart-snapped-index]")).toBeNull();
    expect(interaction.store.getState().hit).toBeNull();
    expect(notify).toHaveBeenCalledTimes(1);
    await render(150);
    expect(tip()?.getAttribute("aria-hidden")).toBe("true");
    await act(() =>
      interaction.hover({
        target: { id: "east", index: 0 },
        clientX: 20,
        clientY: 30,
      }),
    );
    expect(tip()?.getAttribute("aria-hidden")).toBe("false");
    expect(tip()?.textContent).toContain("East150");
  },
);
