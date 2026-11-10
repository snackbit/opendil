import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useStore } from "zustand";
import { useFrameHover } from "../chart-hover";
import { useChartInteraction } from "../chart-interaction";
import type { ChartItem } from "../chart-selection";
import { nearestChartPoint, type ChartPoint } from "../chart-snapping";
import {
  cartesianLayout,
  type Bar,
  type CartesianLayout,
  TICK_GAP,
  type CartesianType,
} from "./layout";

export interface CartesianPlotProps {
  type: CartesianType;
  width: number;
  height: number;
  rows: readonly Record<string, unknown>[];
  /** Every series, in the order that gives each its color and stroke. */
  items: readonly ChartItem[];
  hidden: ReadonlySet<string>;
  xKey: string;
  xLabel: string;
  yLabel: string;
}
const BAR_RADIUS = 4;
/** A bar with rounded corners at the end its value reaches. */
function barPath({ left, width, y, base }: Bar) {
  const height = Math.abs(base - y);
  const radius = Math.min(BAR_RADIUS, width / 2, height);
  // Towards the value: up for a positive bar, down for a negative one.
  const toward = y <= base ? -1 : 1;
  const sweep = toward < 0 ? 1 : 0;
  const shoulder = y - toward * radius;
  return (
    `M${left},${base}V${shoulder}` +
    `A${radius},${radius} 0 0 ${sweep} ${left + radius},${y}` +
    `H${left + width - radius}` +
    `A${radius},${radius} 0 0 ${sweep} ${left + width},${shoulder}` +
    `V${base}Z`
  );
}
/**
 * One series as a path. Rows without a number break the line; a value with
 * no neighbor draws as a dot, which the round line cap makes of a
 * zero-length segment.
 */
function linePath(points: readonly ChartPoint[]) {
  let path = "";
  points.forEach((point, position) => {
    const joined = points[position - 1]?.index === point.index - 1;
    const alone = !joined && points[position + 1]?.index !== point.index + 1;
    path +=
      (joined ? "L" : "M") + point.x + "," + point.y + (alone ? "h0" : "");
  });
  return path;
}

interface MarksProps {
  type: CartesianType;
  layout: CartesianLayout;
  items: readonly ChartItem[];
  /** Reports the bar under the pointer, or null once it leaves the bars. */
  onBar: (event: MouseEvent<SVGGElement> | null) => void;
}
/**
 * The data marks. Pointer movement changes only the cursor and the tooltip,
 * so these render again only with new data or a new size.
 */
const Marks = memo(function Marks({ type, layout, items, onBar }: MarksProps) {
  const leave = useCallback(() => onBar(null), [onBar]);
  const series = items.flatMap((item, order) => {
    const points = layout.points.filter((point) => point.item === item);
    const bars = layout.bars.filter((bar) => bar.item === item);
    if (!points.length) return [];
    return [
      <g
        key={item.id}
        className="dil-chart-series"
        data-dil-series={item.id}
        opacity={`var(--dil-series-${order}-opacity, 1)`}
      >
        {type === "line" && (
          <path
            data-dil-mark="line"
            d={linePath(points)}
            fill="none"
            stroke={item.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...(order ? { strokeDasharray: "5 4" } : {})}
          />
        )}
        {type === "scatter" &&
          points.map((point) => (
            <circle
              key={point.index}
              data-dil-mark="point"
              cx={point.x}
              cy={point.y}
              r={4.5}
              fill={item.color}
            />
          ))}
        {bars.map((bar) => (
          <g key={bar.index} data-row={bar.index} data-series={item.id}>
            {/* A short bar is hoverable anywhere in its column. */}
            <rect
              x={bar.left}
              y={layout.area.y}
              width={bar.width}
              height={layout.area.height}
              fill="transparent"
            />
            <path data-dil-mark="bar" d={barPath(bar)} fill={item.color} />
          </g>
        ))}
      </g>,
    ];
  });
  return type === "bar" ? (
    <g onMouseOver={onBar} onMouseMove={onBar} onMouseLeave={leave}>
      {series}
    </g>
  ) : (
    series
  );
});

interface CursorProps {
  layout: CartesianLayout;
  scatter: boolean;
}
/** Line and scatter hover: snap from anywhere in the plot to the nearest datum. */
function SnapCursor({ layout, scatter }: CursorProps) {
  const interaction = useChartInteraction();
  const target = useStore(interaction.store, (state) => state.hit?.target);
  const hover = useFrameHover(interaction);
  const { area, points } = layout;
  const move = useCallback(
    (event: MouseEvent<SVGRectElement>) => {
      const matrix = event.currentTarget.getScreenCTM();
      if (!matrix) return;
      const cursor = new DOMPoint(event.clientX, event.clientY).matrixTransform(
        matrix.inverse(),
      );
      const point = nearestChartPoint(points, cursor.x, cursor.y, scatter);
      hover(
        point
          ? {
              target: { index: point.index, id: point.item.id },
              clientX: event.clientX,
              clientY: event.clientY,
            }
          : null,
      );
    },
    [points, scatter, hover],
  );
  const leave = useCallback(() => hover(null), [hover]);
  const snapped = target
    ? points.find(
        (point) => point.index === target.index && point.item.id === target.id,
      )
    : undefined;
  const clear = interaction.hover;
  useEffect(() => {
    // Row count and series IDs can stay valid when the hovered value becomes
    // null. Only invalidate that hit; valid points must not publish another
    // pointer update after every layout.
    if (target && !snapped) clear(null);
  }, [target, snapped, clear]);
  return (
    <g aria-hidden="true">
      <rect
        data-chart-hit-area=""
        x={area.x}
        y={area.y}
        width={area.width}
        height={area.height}
        fill="transparent"
        onMouseMove={move}
        onMouseLeave={leave}
      />
      {snapped && (
        <g pointerEvents="none" data-chart-snapped-index={snapped.index}>
          <line
            x1={snapped.x}
            x2={snapped.x}
            y1={area.y}
            y2={area.y + area.height}
            stroke="var(--border)"
          />
          {scatter && (
            <line
              x1={area.x}
              x2={area.x + area.width}
              y1={snapped.y}
              y2={snapped.y}
              stroke="var(--border)"
            />
          )}
          <circle
            cx={snapped.x}
            cy={snapped.y}
            r={5}
            fill={snapped.item.color}
            stroke="var(--background)"
            strokeWidth={2}
          />
        </g>
      )}
    </g>
  );
}

const STEPS: Record<string, readonly [row: number, series: number]> = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowUp: [0, -1],
};
/** A line, bar or scatter chart as one SVG, drawn from its layout. */
export function CartesianPlot({
  type,
  width,
  height,
  rows,
  items,
  hidden,
  xKey,
  xLabel,
  yLabel,
}: CartesianPlotProps) {
  const interaction = useChartInteraction();
  const shown = useMemo(
    () => items.filter((item) => !hidden.has(item.id)),
    [items, hidden],
  );
  const layout = useMemo(
    () =>
      cartesianLayout({
        type,
        width,
        height,
        rows,
        items: shown,
        xKey,
        xLabel: xLabel !== "",
        yLabel: yLabel !== "",
      }),
    [type, width, height, rows, shown, xKey, xLabel, yLabel],
  );
  const hover = useFrameHover(interaction);
  const bar = useCallback(
    (event: MouseEvent<SVGGElement> | null) => {
      const mark =
        event?.target instanceof Element
          ? event.target.closest<SVGGElement>("[data-row]")
          : null;
      const id = mark?.dataset.series;
      hover(
        event && mark && id !== undefined
          ? {
              target: { index: Number(mark.dataset.row), id },
              clientX: event.clientX,
              clientY: event.clientY,
            }
          : null,
      );
    },
    [hover],
  );
  // Arrow keys read the chart datum by datum through the pointer's tooltip.
  const key = useCallback(
    (event: KeyboardEvent<SVGSVGElement>) => {
      if (event.key === "Escape") {
        interaction.hover(null);
        return;
      }
      const step = STEPS[event.key];
      const first = layout.points[0];
      if (!step || !first) return;
      event.preventDefault();
      const current = interaction.store.getState().hit?.target;
      const now = current
        ? layout.points.find(
            (point) =>
              point.index === current.index && point.item.id === current.id,
          )
        : undefined;
      let next = first;
      if (now) {
        // Along the series, or across the series of one row.
        const line = layout.points.filter((point) =>
          step[0] ? point.item === now.item : point.index === now.index,
        );
        const moved = line.indexOf(now) + step[0] + step[1];
        next = line[Math.max(0, Math.min(line.length - 1, moved))] ?? now;
      }
      const box = event.currentTarget.getBoundingClientRect();
      interaction.hover({
        target: { index: next.index, id: next.item.id },
        clientX: box.left + next.x,
        clientY: box.top + next.y,
      });
    },
    [interaction, layout],
  );
  const blur = useCallback(() => interaction.hover(null), [interaction]);
  const { area, xTicks, yTicks } = layout;
  const bottom = area.y + area.height;
  return (
    <svg
      data-dil-plot=""
      className="dil-plot"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="application"
      aria-label="Chart values. Use the arrow keys to read them."
      tabIndex={0}
      onKeyDown={key}
      onBlur={blur}
    >
      <g data-dil-grid="" aria-hidden="true">
        {yTicks.map((tick) => (
          <line
            key={tick.label}
            x1={area.x}
            x2={area.x + area.width}
            y1={tick.position}
            y2={tick.position}
          />
        ))}
      </g>
      <g data-dil-axis="y" aria-hidden="true">
        {yTicks.map((tick) => (
          <text
            key={tick.label}
            x={area.x - TICK_GAP}
            y={tick.position}
            textAnchor="end"
            dominantBaseline="central"
          >
            {tick.label}
          </text>
        ))}
        {yLabel && (
          <text
            data-dil-axis-title=""
            x={10}
            y={area.y + area.height / 2}
            textAnchor="middle"
            dominantBaseline="central"
            transform={`rotate(-90 10 ${area.y + area.height / 2})`}
          >
            {yLabel}
          </text>
        )}
      </g>
      <g data-dil-axis="x" aria-hidden="true">
        {xTicks.map((tick, index) => (
          <text
            key={index}
            x={tick.position}
            y={bottom + TICK_GAP}
            dy="0.71em"
            textAnchor={tick.anchor}
          >
            {tick.label}
          </text>
        ))}
        {xLabel && (
          <text
            data-dil-axis-title=""
            x={area.x + area.width / 2}
            y={height - 5}
            textAnchor="middle"
          >
            {xLabel}
          </text>
        )}
      </g>
      <Marks type={type} layout={layout} items={items} onBar={bar} />
      {type !== "bar" && (
        <SnapCursor layout={layout} scatter={type === "scatter"} />
      )}
    </svg>
  );
}
