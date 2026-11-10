import type { ChartItem } from "../chart-selection";
import type { ChartPoint } from "../chart-snapping";
import { bands, formatTick, linearScale, numericAxis, points } from "./scale";

export type CartesianType = "line" | "bar" | "scatter";
export interface PlotArea {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Tick {
  position: number;
  label: string;
  /** Labels at the ends of the axis stay inside the chart. */
  anchor: "start" | "middle" | "end";
}
export interface Bar extends ChartPoint {
  /** Left edge and width of the bar; `y` is the end its value reaches. */
  left: number;
  width: number;
  /** The zero line the bar grows from. */
  base: number;
}
export interface CartesianLayout {
  area: PlotArea;
  xTicks: Tick[];
  yTicks: Tick[];
  /** Every datum that has a position, in row and then series order. */
  points: ChartPoint[];
  /** Bar charts only, parallel to the points of the same datum. */
  bars: Bar[];
  /** The column of each category, for a bar chart's hover areas. */
  slot: number;
}
export interface CartesianInput {
  type: CartesianType;
  width: number;
  height: number;
  rows: readonly Record<string, unknown>[];
  /** The series that are shown; hidden ones take no space on either axis. */
  items: readonly ChartItem[];
  xKey: string;
  xLabel: boolean;
  yLabel: boolean;
}
// The space around the plot. Charts have had these proportions since they
// were drawn by Recharts; answers were written and measured against them.
const MARGIN = 5;
const Y_AXIS = 45;
const Y_AXIS_TITLED = 64;
const X_AXIS = 30;
const X_AXIS_TITLED = 44;
/** Share of a category's slot left empty on each side of its bars. */
const CATEGORY_GAP = 0.1;
const BAR_GAP = 4;
// Tick text is 12 px. Its width is estimated instead of measured: measuring
// forces layout, and a label that is a few pixels off only moves the point
// at which labels thin out.
const CHARACTER = 6.6;
const LABEL_GAP = 12;
/** Between a y tick's label and the plot. */
export const TICK_GAP = 8;
const estimate = (label: string) => label.length * CHARACTER;
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const label = (value: unknown) =>
  typeof value === "number" || typeof value === "string" ? String(value) : "";

/**
 * A label centered on its position, or held inside the chart where it would
 * cross an edge. On the left it may reach under the y axis, which has no
 * text below the plot.
 */
function tick(position: number, text: string, area: PlotArea): Tick {
  const half = estimate(text) / 2;
  const anchor =
    position + half > area.x + area.width + MARGIN
      ? "end"
      : position - half < 0
        ? "start"
        : "middle";
  return { position, label: text, anchor };
}
/** The horizontal extent of a tick's label. */
function extent({ position, label, anchor }: Tick) {
  const width = estimate(label);
  const left =
    anchor === "start"
      ? position
      : anchor === "end"
        ? position - width
        : position - width / 2;
  return { left, right: left + width };
}
/**
 * As many category labels as fit without touching, from the first, and
 * always the last: readers look for where a series ends.
 */
function categoryTicks(
  labels: readonly string[],
  center: (index: number) => number,
  area: PlotArea,
): Tick[] {
  const kept: Tick[] = [];
  let edge = -Infinity;
  labels.forEach((text, index) => {
    const next = tick(center(index), text, area);
    const { left, right } = extent(next);
    if (left < edge + LABEL_GAP) return;
    kept.push(next);
    edge = right;
  });
  const last = labels.at(-1);
  if (last === undefined) return kept;
  const end = tick(center(labels.length - 1), last, area);
  if (kept.at(-1)?.position === end.position) return kept;
  // The last label replaces the neighbors it would touch.
  const { left } = extent(end);
  while (kept.length > 1 && extent(kept.at(-1)!).right + LABEL_GAP > left)
    kept.pop();
  kept.push(end);
  return kept;
}

/** Where everything of a line, bar or scatter chart goes, for one size. */
export function cartesianLayout({
  type,
  width,
  height,
  rows,
  items,
  xKey,
  xLabel,
  yLabel,
}: CartesianInput): CartesianLayout {
  const values = rows.flatMap((row) =>
    items.flatMap((item) => (finite(row[item.id]) ? [row[item.id]] : [])),
  ) as number[];
  const yAxis = numericAxis(values);
  const yLabels = yAxis.ticks.map(formatTick);
  // The axis keeps its stock width and grows only for numbers too long for it.
  const left =
    MARGIN +
    (yLabel ? Y_AXIS_TITLED - Y_AXIS : 0) +
    Math.max(Y_AXIS, Math.ceil(Math.max(...yLabels.map(estimate))) + TICK_GAP);
  const area: PlotArea = {
    x: left,
    y: MARGIN,
    width: Math.max(0, width - MARGIN - left),
    height: Math.max(
      0,
      height - 2 * MARGIN - (xLabel ? X_AXIS_TITLED : X_AXIS),
    ),
  };
  const right = area.x + area.width;
  const bottom = area.y + area.height;
  const scaleY = linearScale(yAxis, bottom, area.y);
  const yTicks: Tick[] = yAxis.ticks.map((value, index) => ({
    position: scaleY(value)!,
    label: yLabels[index]!,
    anchor: "end",
  }));

  let xTicks: Tick[];
  let slot = 0;
  // The position of a row's category, by row index.
  let center: (index: number) => number;
  if (type === "scatter") {
    const xAxis = numericAxis(rows.map((row) => row[xKey]).filter(finite));
    const scaleX = linearScale(xAxis, area.x, right);
    center = (index) => scaleX(rows[index]?.[xKey]) ?? NaN;
    xTicks = xAxis.ticks.map((value) =>
      tick(scaleX(value)!, formatTick(value), area),
    );
  } else {
    const axis =
      type === "bar"
        ? bands(rows.length, area.x, right)
        : points(rows.length, area.x, right);
    slot = axis.step;
    center = axis.center;
    xTicks = categoryTicks(
      rows.map((row) => label(row[xKey])),
      center,
      area,
    );
  }

  const placed: ChartPoint[] = [];
  const bars: Bar[] = [];
  const group = slot * (1 - 2 * CATEGORY_GAP);
  const count = Math.max(1, items.length);
  // Dense categories shrink both bars and gaps, keeping the whole group
  // inside its slot even when less than one pixel remains for each bar.
  const gap = Math.min(BAR_GAP, group / (2 * count));
  const barWidth = (group - gap * (count - 1)) / count;
  const base = scaleY(0)!;
  rows.forEach((row, index) => {
    const middle = center(index);
    if (!Number.isFinite(middle)) return;
    items.forEach((item, position) => {
      const value = row[item.id];
      if (!finite(value)) return;
      const y = scaleY(value)!;
      if (type !== "bar") {
        placed.push({ index, item, row, x: middle, y, value });
        return;
      }
      const barLeft = middle - group / 2 + position * (barWidth + gap);
      const point = {
        index,
        item,
        row,
        x: barLeft + barWidth / 2,
        y,
        value,
      };
      placed.push(point);
      bars.push({ ...point, left: barLeft, width: barWidth, base });
    });
  });
  return { area, xTicks, yTicks, points: placed, bars, slot };
}
