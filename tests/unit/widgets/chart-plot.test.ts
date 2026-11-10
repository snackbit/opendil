// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bands,
  linearScale,
  numericAxis,
  points,
} from "../../../packages/opendil/src/dil/widgets/charts/plot/scale";
import { cartesianLayout } from "../../../packages/opendil/src/dil/widgets/charts/plot/layout";
import { CartesianPlot } from "../../../packages/opendil/src/dil/widgets/charts/plot/cartesian-plot";
import {
  PiePlot,
  pieSectors,
} from "../../../packages/opendil/src/dil/widgets/charts/plot/pie-plot";
import { usePlotWidth } from "../../../packages/opendil/src/dil/widgets/charts/plot/use-plot-size";
import {
  ChartInteractionContext,
  createChartInteraction,
} from "../../../packages/opendil/src/dil/widgets/charts/chart-interaction";

const EAST = { id: "east", label: "East", color: "red" };
const WEST = { id: "west", label: "West", color: "blue" };

describe("axes", () => {
  it.each([
    [[85], [0, 20, 40, 60, 80, 100]],
    [[1580], [0, 400, 800, 1200, 1600]],
    [[3], [0, 1, 2, 3]],
    [
      [-12.5, 18.25],
      [-20, -10, 0, 10, 20],
    ],
    [[-5], [-5, -4, -3, -2, -1, 0]],
    [[0.11], [0, 0.025, 0.05, 0.075, 0.1, 0.125]],
    // Nothing to scale, and values that are not numbers.
    [[], [0, 0.2, 0.4, 0.6, 0.8, 1]],
    [
      [NaN, Infinity],
      [0, 0.2, 0.4, 0.6, 0.8, 1],
    ],
  ])("covers %j with round ticks from zero", (values, ticks) => {
    expect(numericAxis(values).ticks).toEqual(ticks);
  });
  it("positions numbers along a range and nothing else", () => {
    const scale = linearScale({ min: 0, max: 100 }, 200, 0);
    expect(scale(25)).toBe(150);
    expect(scale("25")).toBeUndefined();
    expect(scale(NaN)).toBeUndefined();
  });
  it("gives bars a slot each and lines the full width", () => {
    expect(bands(4, 0, 100).center(0)).toBe(12.5);
    expect(bands(0, 0, 100).step).toBe(0);
    const line = points(5, 0, 100);
    expect([line.center(0), line.center(4)]).toEqual([0, 100]);
    expect(points(1, 0, 100).center(0)).toBe(50);
  });
});

const layout = (
  input: Partial<Parameters<typeof cartesianLayout>[0]> & {
    rows: Record<string, unknown>[];
  },
) =>
  cartesianLayout({
    type: "line",
    width: 400,
    height: 248,
    items: [EAST],
    xKey: "time",
    xLabel: false,
    yLabel: false,
    ...input,
  });
describe("layout", () => {
  it("keeps the stock plot area and makes room for axis titles and long numbers", () => {
    const rows = [{ time: "a", east: 10 }];
    expect(layout({ rows }).area).toEqual({
      x: 50,
      y: 5,
      width: 345,
      height: 208,
    });
    expect(layout({ rows, xLabel: true, yLabel: true }).area).toEqual({
      x: 69,
      y: 5,
      width: 326,
      height: 194,
    });
    const wide = layout({ rows: [{ time: "a", east: 2_310_000 }] });
    expect(wide.area.x).toBeGreaterThan(50);
    expect(wide.yTicks.at(-1)?.label).toBe("2500000");
  });
  it("places a line's values from edge to edge and skips rows without a number", () => {
    const { points: placed, bars } = layout({
      rows: [
        { time: "a", east: 0 },
        { time: "b", east: null },
        { time: "c", east: 10 },
      ],
    });
    expect(placed.map((point) => [point.index, point.x, point.y])).toEqual([
      [0, 50, 213],
      [2, 395, 5],
    ]);
    expect(bars).toEqual([]);
  });
  it("groups bars in their category's slot and grows them from zero", () => {
    const { bars } = layout({
      type: "bar",
      items: [EAST, WEST],
      rows: [
        { time: "a", east: 10, west: -10 },
        { time: "b", east: 5, west: 5 },
      ],
    });
    expect(bars).toHaveLength(4);
    const [east, west] = bars;
    expect(east!.base).toBe(west!.base);
    expect(east!.y).toBeLessThan(east!.base);
    expect(west!.y).toBeGreaterThan(west!.base);
    expect(west!.left - (east!.left + east!.width)).toBeCloseTo(4);
    // A tenth of the 172.5 px slot stays empty on each side of the group.
    expect(east!.left).toBeCloseTo(50 + 17.25);
  });
  it.each([320, 56, 50])(
    "keeps dense bar groups inside their categories at %i px",
    (width) => {
      const items = [
        EAST,
        WEST,
        { ...EAST, id: "north" },
        { ...WEST, id: "south" },
      ];
      const rows = Array.from({ length: 30 }, (_, index) => ({
        time: String(index),
        east: 1,
        west: 2,
        north: 3,
        south: 4,
      }));
      const { bars, area, slot } = layout({ type: "bar", width, items, rows });
      expect(bars).toHaveLength(120);
      for (const bar of bars) {
        expect(bar.width).toBeGreaterThanOrEqual(0);
        expect(bar.width).toBeLessThanOrEqual(slot / items.length);
        expect(bar.left).toBeGreaterThanOrEqual(
          area.x + bar.index * slot - 1e-10,
        );
        expect(bar.left + bar.width).toBeLessThanOrEqual(
          area.x + (bar.index + 1) * slot + 1e-10,
        );
      }
      expect(bars[1]!.left).toBeGreaterThanOrEqual(
        bars[0]!.left + bars[0]!.width,
      );
    },
  );
  it("positions scatter points by their numeric x and drops the others", () => {
    const { points: placed, xTicks } = layout({
      type: "scatter",
      rows: [
        { time: 0, east: 1 },
        { time: 50, east: 2 },
        { time: "later", east: 3 },
      ],
    });
    expect(placed.map((point) => point.x)).toEqual([50, 395]);
    expect(xTicks.map((tick) => tick.label)).toEqual([
      "0",
      "10",
      "20",
      "30",
      "40",
      "50",
    ]);
  });
  it("shows the category labels that fit, always the last, inside the chart", () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({
      time: "2026-03-" + String(index + 1).padStart(2, "0"),
      east: index,
    }));
    const { xTicks } = layout({ rows });
    expect(xTicks.length).toBeLessThan(6);
    expect(xTicks[0]).toMatchObject({ label: "2026-03-01", anchor: "middle" });
    expect(xTicks.at(-1)).toMatchObject({ label: "2026-03-30", anchor: "end" });
    // Evenly spaced until the last label takes its neighbor's place.
    const gaps = xTicks
      .slice(1, -1)
      .map((tick, index) => tick.position - xTicks[index]!.position);
    expect(new Set(gaps.map((gap) => Math.round(gap))).size).toBe(1);
    // A label wider than what is left of it starts at its position.
    const narrow = layout({
      width: 120,
      rows: [{ time: "a very long first category", east: 1 }],
    });
    expect(narrow.xTicks[0]?.anchor).toBe("end");
    expect(layout({ rows: [] }).xTicks).toEqual([]);
    expect(layout({ rows: [{ time: false, east: 1 }] }).xTicks[0]?.label).toBe(
      "",
    );
  });
});

let host: HTMLDivElement, root: Root;
let frames: FrameRequestCallback[] = [];
const flush = () =>
  act(() => {
    const queued = frames;
    frames = [];
    for (const frame of queued) frame(0);
  });
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  // happy-dom has no SVG coordinate transforms; an identity matrix stands in.
  vi.stubGlobal(
    "DOMPoint",
    class {
      constructor(
        readonly x: number,
        readonly y: number,
      ) {}
      matrixTransform() {
        return this;
      }
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  frames = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const interaction = () => createChartInteraction();
async function show(
  chart: ReturnType<typeof interaction>,
  children: ReactNode,
) {
  await act(() =>
    root.render(
      createElement(
        ChartInteractionContext.Provider,
        { value: chart },
        children,
      ),
    ),
  );
}
const ROWS = [
  { time: "10:00", east: 10, west: 30 },
  { time: "10:05", east: 20, west: null },
  { time: "10:10", east: 40, west: 20 },
];
const plot = (
  props: Partial<Parameters<typeof CartesianPlot>[0]> = {},
): ReactNode =>
  createElement(CartesianPlot, {
    type: "line",
    width: 400,
    height: 248,
    rows: ROWS,
    items: [EAST, WEST],
    hidden: new Set<string>(),
    xKey: "time",
    xLabel: "",
    yLabel: "",
    ...props,
  });
const marks = (name: string) => [
  ...host.querySelectorAll(`[data-dil-mark="${name}"]`),
];
const mouse = (element: Element, type: string, x = 0, y = 0) =>
  act(() =>
    element.dispatchEvent(
      new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }),
    ),
  );

describe("cartesian plot", () => {
  it("draws a line per shown series, broken where a value is missing", async () => {
    const chart = interaction();
    await show(chart, plot({ xLabel: "Time", yLabel: "Latency" }));
    const [east, west] = marks("line");
    expect(east?.getAttribute("d")).toBe("M69,150.5L232,102L395,5");
    // Two values without a neighbor draw as dots.
    expect(west?.getAttribute("d")).toBe("M69,53.5h0M395,102h0");
    expect(west?.getAttribute("stroke-dasharray")).toBe("5 4");
    expect(east?.hasAttribute("stroke-dasharray")).toBe(false);
    expect(
      [...host.querySelectorAll("[data-dil-axis-title]")].map(
        (title) => title.textContent,
      ),
    ).toEqual(["Latency", "Time"]);
    await show(chart, plot({ hidden: new Set(["east"]) }));
    expect(marks("line")).toHaveLength(1);
    // A hidden series keeps the color and stroke of its place among all.
    expect(
      host.querySelector("[data-dil-series]")?.getAttribute("opacity"),
    ).toBe("var(--dil-series-1-opacity, 1)");
    expect(host.querySelectorAll("[data-dil-axis-title]")).toHaveLength(0);
  });
  it("snaps the cursor to the nearest datum and lets go when the pointer leaves or the datum goes", async () => {
    const chart = interaction();
    await show(chart, plot());
    const area = host.querySelector("[data-chart-hit-area]")!;
    await mouse(area, "mousemove", 220, 100);
    await flush();
    expect(chart.store.getState().hit).toEqual({
      target: { index: 1, id: "east" },
      clientX: 220,
      clientY: 100,
    });
    expect(
      host
        .querySelector("[data-chart-snapped-index]")
        ?.getAttribute("data-chart-snapped-index"),
    ).toBe("1");
    expect(
      host.querySelectorAll("[data-chart-snapped-index] line"),
    ).toHaveLength(1);
    // The hovered value disappears while its row and series remain.
    await show(
      chart,
      plot({ rows: ROWS.map((row) => ({ ...row, east: null })) }),
    );
    expect(chart.store.getState().hit).toBeNull();
    await mouse(area, "mousemove", 60, 60);
    await flush();
    expect(chart.store.getState().hit?.target).toEqual({
      index: 0,
      id: "west",
    });
    await mouse(area, "mouseout");
    await flush();
    expect(chart.store.getState().hit).toBeNull();
    // Nothing to snap to, and a browser without a matrix.
    await show(chart, plot({ rows: [] }));
    await mouse(host.querySelector("[data-chart-hit-area]")!, "mousemove");
    await flush();
    expect(chart.store.getState().hit).toBeNull();
    const blank = host.querySelector<SVGRectElement>("[data-chart-hit-area]")!;
    vi.spyOn(blank, "getScreenCTM").mockReturnValue(null);
    await mouse(blank, "mousemove");
    expect(frames).toEqual([]);
  });
  it("draws scatter points with a crosshair on the snapped one", async () => {
    const chart = interaction();
    await show(
      chart,
      plot({
        type: "scatter",
        rows: [
          { time: 10, east: 1, west: 2 },
          { time: 20, east: 3, west: 4 },
        ],
      }),
    );
    expect(marks("point")).toHaveLength(4);
    await mouse(
      host.querySelector("[data-chart-hit-area]")!,
      "mousemove",
      395,
      5,
    );
    await flush();
    expect(chart.store.getState().hit?.target).toEqual({
      index: 1,
      id: "west",
    });
    expect(
      host.querySelectorAll("[data-chart-snapped-index] line"),
    ).toHaveLength(2);
  });
  it("reports the bar whose column is under the pointer", async () => {
    const chart = interaction();
    await show(
      chart,
      plot({
        type: "bar",
        rows: [
          { time: "a", east: 10, west: -5 },
          { time: "b", east: 1, west: 2 },
        ],
      }),
    );
    const bars = marks("bar");
    expect(bars).toHaveLength(4);
    expect(host.querySelector("[data-chart-hit-area]")).toBeNull();
    // Rounded at the end the value reaches: above zero, or below it.
    expect(bars[0]?.getAttribute("d")).toMatch(/A4,4 0 0 1 /);
    expect(bars[2]?.getAttribute("d")).toMatch(/A4,4 0 0 0 /);
    const column = bars[2]!.parentElement!.querySelector("rect")!;
    await mouse(column, "mousemove", 7, 9);
    await flush();
    expect(chart.store.getState().hit).toEqual({
      target: { index: 0, id: "west" },
      clientX: 7,
      clientY: 9,
    });
    // Between two groups there is plot space without a bar.
    await mouse(host.querySelector("[data-dil-plot]")!, "mousemove");
    expect(chart.store.getState().hit).not.toBeNull();
    await mouse(
      bars[2]!.closest("[data-dil-series]")!.parentElement!,
      "mouseout",
    );
    await flush();
    expect(chart.store.getState().hit).toBeNull();
  });
  it("reads the chart datum by datum with the arrow keys", async () => {
    const chart = interaction();
    await show(chart, plot());
    const svg = host.querySelector<SVGSVGElement>("[data-dil-plot]")!;
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 200, 400, 248),
    );
    const press = (key: string) =>
      act(() =>
        svg.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })),
      );
    const target = () => chart.store.getState().hit?.target;
    await press("Tab");
    expect(target()).toBeUndefined();
    // A pointer leave from the preceding frame must not clear a newer
    // keyboard selection when its queued animation frame runs.
    await mouse(host.querySelector("[data-chart-hit-area]")!, "mouseout");
    await press("ArrowRight");
    await flush();
    // The first datum, at its position on the page.
    expect(chart.store.getState().hit).toEqual({
      target: { index: 0, id: "east" },
      clientX: 150,
      clientY: 361,
    });
    await press("ArrowRight");
    expect(target()).toEqual({ index: 1, id: "east" });
    // Row 1 has no western value; the row's only series stays.
    await press("ArrowDown");
    expect(target()).toEqual({ index: 1, id: "east" });
    await press("ArrowLeft");
    await press("ArrowLeft");
    expect(target()).toEqual({ index: 0, id: "east" });
    await press("ArrowDown");
    expect(target()).toEqual({ index: 0, id: "west" });
    // Along the western series, which skips the row without a value.
    await press("ArrowRight");
    expect(target()).toEqual({ index: 2, id: "west" });
    await press("ArrowUp");
    expect(target()).toEqual({ index: 2, id: "east" });
    await press("Escape");
    expect(target()).toBeUndefined();
    await press("ArrowRight");
    await act(() =>
      svg.dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
    );
    expect(target()).toBeUndefined();
    // A chart without data has nothing to read.
    await show(chart, plot({ rows: [] }));
    await act(() =>
      host
        .querySelector("[data-dil-plot]")!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
        ),
    );
    expect(target()).toBeUndefined();
  });
});

const SLICES = [
  { index: 0, item: EAST, row: { name: "East", value: 1 } },
  { index: 1, item: WEST, row: { name: "West", value: 3 } },
  { index: 2, item: { ...WEST, id: "none" }, row: { name: "None", value: 0 } },
];
describe("donut", () => {
  it("starts at 12 o'clock and runs clockwise in data order", () => {
    const [east, west, ...rest] = pieSectors(SLICES, "value", 200, 200);
    expect(rest).toEqual([]);
    // Outer radius 78: from the top, a quarter turn to 3 o'clock.
    expect(east?.path).toMatch(/^M100,22A78,78 0 0 1 178,100L/);
    expect(west?.path).toMatch(/^M178,100A78,78 0 1 1 /);
    expect(east?.middle.x).toBeGreaterThan(100);
    expect(east?.middle.y).toBeLessThan(100);
  });
  it("draws a single slice as a whole ring", () => {
    const [ring] = pieSectors(SLICES.slice(0, 1), "value", 200, 200);
    expect(ring?.path.match(/Z/g)).toHaveLength(2);
    expect(ring?.path).toContain("M100,22A78,78 0 1 1 100,178");
  });
  it("opens the tooltip under the pointer and on the focused slice", async () => {
    const chart = interaction();
    await show(
      chart,
      createElement(PiePlot, {
        width: 200,
        height: 200,
        slices: SLICES,
        valueKey: "value",
      }),
    );
    const sectors = marks("sector") as SVGPathElement[];
    expect(sectors.map((sector) => sector.getAttribute("aria-label"))).toEqual([
      "East: 1",
      "West: 3",
    ]);
    await mouse(sectors[1]!, "mousemove", 30, 40);
    await flush();
    expect(chart.store.getState().hit).toEqual({
      target: { index: 1, id: "west" },
      clientX: 30,
      clientY: 40,
    });
    await mouse(sectors[1]!, "mouseout");
    await flush();
    expect(chart.store.getState().hit).toBeNull();
    // Focus from a pointer press opens nothing; the pointer already did.
    const focus = () =>
      act(() =>
        sectors[0]!.dispatchEvent(new FocusEvent("focusin", { bubbles: true })),
      );
    vi.spyOn(sectors[0]!, "matches").mockReturnValue(false);
    await focus();
    expect(chart.store.getState().hit).toBeNull();
    vi.spyOn(sectors[0]!, "matches").mockReturnValue(true);
    vi.spyOn(
      sectors[0]!.closest("svg")!,
      "getBoundingClientRect",
    ).mockReturnValue(new DOMRect(10, 20, 200, 200));
    await focus();
    expect(chart.store.getState().hit?.target).toEqual({
      index: 0,
      id: "east",
    });
    expect(chart.store.getState().hit?.clientX).toBeGreaterThan(110);
    await act(() =>
      sectors[0]!.dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
    );
    expect(chart.store.getState().hit).toBeNull();
  });
});

describe("plot width", () => {
  function Sized() {
    const [width, attach] = usePlotWidth();
    return createElement("div", { ref: attach, "data-width": width });
  }
  const width = () => host.firstElementChild?.getAttribute("data-width");
  it("starts at the width charts last measured and follows its container", async () => {
    const observers: Array<{
      notify(width?: number): void;
      disconnect: ReturnType<typeof vi.fn>;
    }> = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        disconnect = vi.fn();
        observe = vi.fn();
        constructor(callback: (entries: unknown[]) => void) {
          observers.push({
            notify: (measured) =>
              callback(
                measured === undefined
                  ? []
                  : [{ contentRect: { width: measured } }],
              ),
            disconnect: this.disconnect,
          });
        }
      },
    );
    // Server markup uses the stock width.
    expect(renderToStaticMarkup(createElement(Sized))).toContain(
      'data-width="640"',
    );
    await act(() => root.render(createElement(Sized)));
    expect(width()).toBe("640");
    await act(() => observers[0]!.notify(811.6));
    expect(width()).toBe("812");
    // A hidden chart, or an observation without an entry, changes nothing.
    await act(() => observers[0]!.notify(0));
    await act(() => observers[0]!.notify());
    expect(width()).toBe("812");
    await act(() => root.render(null));
    expect(observers[0]!.disconnect).toHaveBeenCalled();
    // The next chart starts where this one ended.
    await act(() => root.render(createElement(Sized)));
    expect(width()).toBe("812");
  });
  it("keeps its width where the browser cannot observe sizes", async () => {
    vi.stubGlobal("ResizeObserver", undefined);
    await act(() => root.render(createElement(Sized)));
    expect(width()).toBe("812");
  });
});
