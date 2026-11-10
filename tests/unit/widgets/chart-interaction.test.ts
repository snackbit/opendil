// @vitest-environment happy-dom
import { act, createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { ChartEmphasis } from "../../../packages/opendil/src/dil/widgets/charts/chart-emphasis";
import {
  ChartInteractionContext,
  createChartInteraction,
  emphasizedSeries,
  useChartInteraction,
} from "../../../packages/opendil/src/dil/widgets/charts/chart-interaction";
import {
  useFrameHover,
  type ChartHit,
} from "../../../packages/opendil/src/dil/widgets/charts/chart-hover";

const point = (index = 1, id = "east", clientX = 20): ChartHit => ({
  target: { index, id },
  clientX,
  clientY: 30,
});

it("updates only scoped opacity variables for series emphasis", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const chart = createChartInteraction();
  const scope = createRef<HTMLDivElement>();
  const host = document.createElement("div");
  const element = document.createElement("div");
  scope.current = element;
  const write = vi.spyOn(element.style, "setProperty");
  const root = createRoot(host);
  const items = [
    { id: "east", label: "East", color: "red" },
    { id: "west", label: "West", color: "blue" },
  ];
  await act(() =>
    root.render(
      createElement(
        ChartInteractionContext.Provider,
        { value: chart },
        createElement(ChartEmphasis, { root: scope, items }),
      ),
    ),
  );
  // Unset is full opacity: mounting writes no style.
  expect(write).not.toHaveBeenCalled();
  await act(() => chart.hover(point()));
  expect(write).toHaveBeenCalledExactlyOnceWith(
    "--dil-series-1-opacity",
    "0.625",
  );
  write.mockClear();
  await act(() => chart.hover(point(1, "east", 31)));
  expect(write).not.toHaveBeenCalled();
  await act(() => chart.highlightLegend("west"));
  expect(element.style.getPropertyValue("--dil-series-0-opacity")).toBe(
    "0.625",
  );
  expect(element.style.getPropertyValue("--dil-series-1-opacity")).toBe("");
  await act(() => chart.highlightLegend("missing"));
  expect(element.style.getPropertyValue("--dil-series-0-opacity")).toBe("");
  scope.current = null;
  await act(() => chart.highlightLegend(null));
  await act(() => root.unmount());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("deduplicates hover and keeps the logical target stable while the pointer moves", () => {
  const chart = createChartInteraction();
  const notify = vi.fn();
  chart.store.subscribe(notify);
  chart.hover(null);
  expect(notify).not.toHaveBeenCalled();
  chart.hover(point());
  const first = chart.store.getState().hit;
  chart.hover(point());
  expect(chart.store.getState().hit).toBe(first);
  chart.hover(point(1, "east", 21));
  expect(chart.store.getState().hit?.target).toBe(first?.target);
  expect(notify).toHaveBeenCalledTimes(2);
  chart.hover(point(2, "west"));
  expect(chart.store.getState().hit?.target).toEqual({ index: 2, id: "west" });
  expect(emphasizedSeries(chart.store.getState())).toBe("west");
  chart.hover(null);
  expect(chart.store.getState().hit).toBeNull();
  expect(emphasizedSeries(chart.store.getState())).toBeNull();
});

it("keeps the legend's emphasis apart from the pointer's", () => {
  const chart = createChartInteraction();
  const notify = vi.fn();
  chart.store.subscribe(notify);
  chart.highlightLegend("west");
  chart.highlightLegend("west");
  expect(notify).toHaveBeenCalledTimes(1);
  chart.hover(point());
  // The legend entry in use wins over the datum under the pointer.
  expect(emphasizedSeries(chart.store.getState())).toBe("west");
  chart.hover(null);
  expect(chart.store.getState()).toEqual({
    hit: null,
    legendHovered: "west",
  });
  chart.highlightLegend(null);
  expect(chart.store.getState().legendHovered).toBeNull();
});

it("keeps valid identities without publishing a new hover after data or scale changes", () => {
  const chart = createChartInteraction();
  chart.hover(point());
  chart.highlightLegend("west");
  const before = chart.store.getState();
  const notify = vi.fn();
  chart.store.subscribe(notify);
  chart.reconcile(["west", "east"], 4);
  expect(chart.store.getState()).toBe(before);
  expect(notify).not.toHaveBeenCalled();
});

it("rejects pointer samples queued before the visible model changes", () => {
  const chart = createChartInteraction();
  chart.reconcile(["east"], 2);
  chart.hover(point());
  chart.hover(point(1, "removed"));
  chart.hover(point(-1));
  chart.hover(point(2));
  expect(chart.store.getState().hit?.target).toEqual({ id: "east", index: 1 });
  chart.hover(null);
  expect(chart.store.getState().hit).toBeNull();
});

it("ignores hidden legend entries until their series is visible again", () => {
  const chart = createChartInteraction();
  chart.reconcile(["east", "west"], 2);
  chart.highlightLegend("west");
  chart.reconcile(["east"], 2);
  const notify = vi.fn();
  chart.store.subscribe(notify);
  chart.highlightLegend("west");
  expect(chart.store.getState().legendHovered).toBeNull();
  expect(notify).not.toHaveBeenCalled();
  chart.highlightLegend("east");
  expect(chart.store.getState().legendHovered).toBe("east");
  chart.highlightLegend("west");
  expect(chart.store.getState().legendHovered).toBeNull();
  chart.reconcile(["east", "west"], 2);
  chart.highlightLegend("west");
  expect(chart.store.getState().legendHovered).toBe("west");
});

it.each([
  { ids: ["west"], rows: 3, index: 1 },
  { ids: ["east", "west"], rows: 1, index: 1 },
  { ids: ["east", "west"], rows: 3, index: -1 },
])(
  "drops missing or removed data without retaining old row objects: %j",
  ({ ids, rows, index }) => {
    const chart = createChartInteraction();
    chart.hover(point(index));
    chart.highlightLegend("removed");
    chart.reconcile(ids, rows);
    expect(chart.store.getState()).toEqual({
      hit: null,
      legendHovered: null,
    });
  },
);

it("reconciles the legend's identity without a pointer target", () => {
  const chart = createChartInteraction();
  chart.highlightLegend("west");
  chart.reconcile(["west"], 3);
  expect(chart.store.getState().legendHovered).toBe("west");
  chart.reconcile([], 0);
  expect(chart.store.getState().legendHovered).toBeNull();
});

it("keeps interactions scoped to their own chart and rejects an absent provider", () => {
  function Read() {
    return createElement(
      "b",
      null,
      useChartInteraction().store.getState().legendHovered,
    );
  }
  expect(() => renderToStaticMarkup(createElement(Read))).toThrow(
    "Chart interaction scope is missing",
  );
  const first = createChartInteraction(),
    second = createChartInteraction();
  first.highlightLegend("east");
  second.highlightLegend("west");
  const render = (value: ReturnType<typeof createChartInteraction>) =>
    renderToStaticMarkup(
      createElement(
        ChartInteractionContext.Provider,
        { value },
        createElement(Read),
      ),
    );
  expect(render(first)).toBe("<b>east</b>");
  expect(render(second)).toBe("<b>west</b>");
});

it("publishes only the latest pointer sample per frame and cancels it on unmount", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let frame: FrameRequestCallback | undefined;
  const schedule = vi.fn((next: FrameRequestCallback) => {
    frame = next;
    return 1;
  });
  const cancel = vi.fn();
  vi.stubGlobal("requestAnimationFrame", schedule);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  const chart = createChartInteraction();
  const publish = vi.spyOn(chart, "hover");
  let hover: ReturnType<typeof useFrameHover> | undefined;
  function Harness() {
    hover = useFrameHover(chart);
    return null;
  }
  const mount = document.createElement("div");
  const root = createRoot(mount);
  await act(() => root.render(createElement(Harness)));
  if (!hover) throw new Error("Expected the pointer handler");
  hover(point());
  hover(point(2));
  hover(null);
  expect(schedule).toHaveBeenCalledTimes(1);
  if (!frame) throw new Error("Expected a scheduled frame");
  frame(0);
  expect(publish).toHaveBeenCalledExactlyOnceWith(null);
  // An older pointer sample cannot reopen a tooltip dismissed by the keyboard.
  hover(point());
  chart.hover(null);
  frame(0);
  expect(chart.store.getState().hit).toBeNull();
  expect(publish).toHaveBeenCalledTimes(2);
  hover(point());
  expect(schedule).toHaveBeenCalledTimes(3);
  await act(() => root.unmount());
  expect(cancel).toHaveBeenCalledWith(1);
  expect(publish).toHaveBeenCalledTimes(2);
});
