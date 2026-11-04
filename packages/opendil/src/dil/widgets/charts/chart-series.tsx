import { useCallback, type MouseEvent } from "react";
import { Bar, Line, Scatter, type BarRectangleItem } from "recharts";
import type { ChartHit } from "./chart-hover";
import type { ChartItem } from "./chart-selection";
/** A transparent full-height column per bar, so a short bar is hoverable above its top. */
const BAR_HIT_COLUMN = { fill: "transparent" };
export interface ChartSeriesProps {
  item: ChartItem;
  index: number;
  type: string;
  hidden: boolean;
  muted: boolean;
  rows: Record<string, unknown>[];
  highlight: (id: string | null) => void;
  /** Bar hover: report the bar under the pointer, or null after leaving it. */
  hover: (hit: ChartHit | null) => void;
  /**
   * Show Recharts' own active dots. Only keyboard navigation wants them; on pointer
   * hover Recharts keeps a stale active index next to the snapped point.
   */
  markers: boolean;
}
export function ChartSeries({
  item,
  index,
  type,
  hidden,
  muted,
  rows,
  highlight,
  hover,
  markers,
}: ChartSeriesProps) {
  const enter = useCallback(() => highlight(item.id), [highlight, item.id]);
  const leave = useCallback(() => highlight(null), [highlight]);
  const barMove = useCallback(
    (bar: BarRectangleItem, _index: number, event: MouseEvent) => {
      const row = rows[bar.originalDataIndex];
      if (row)
        hover({
          target: { index: bar.originalDataIndex, item, row },
          clientX: event.clientX,
          clientY: event.clientY,
        });
    },
    [rows, item, hover],
  );
  const barLeave = useCallback(() => hover(null), [hover]);
  const props = {
    dataKey: item.id,
    name: item.label,
    hide: hidden,
    className: "dil-chart-series",
    opacity: muted ? 0.625 : 1,
    onMouseEnter: enter,
    onMouseLeave: leave,
    onFocus: enter,
    onBlur: leave,
    isAnimationActive: false,
  };
  if (type === "bar")
    return (
      <Bar
        {...props}
        fill={item.color}
        radius={[4, 4, 0, 0]}
        background={BAR_HIT_COLUMN}
        activeBar={false}
        onMouseEnter={barMove}
        onMouseMove={barMove}
        onMouseLeave={barLeave}
      />
    );
  if (type === "scatter")
    return <Scatter {...props} data={rows} fill={item.color} />;
  return (
    <Line
      {...props}
      stroke={item.color}
      strokeWidth={2}
      strokeDasharray={index ? "5 4" : ""}
      dot={false}
      activeDot={markers}
    />
  );
}
