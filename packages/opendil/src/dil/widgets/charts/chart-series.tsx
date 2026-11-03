import { useCallback } from "react";
import { Bar, Line, Scatter } from "recharts";
import type { ChartItem } from "./chart-selection";
export interface ChartSeriesProps {
  item: ChartItem;
  index: number;
  type: string;
  hidden: boolean;
  muted: boolean;
  rows: Record<string, unknown>[];
  highlight: (id: string | null) => void;
}
export function ChartSeries({
  item,
  index,
  type,
  hidden,
  muted,
  rows,
  highlight,
}: ChartSeriesProps) {
  const enter = useCallback(() => highlight(item.id), [highlight, item.id]);
  const leave = useCallback(() => highlight(null), [highlight]);
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
    return <Bar {...props} fill={item.color} radius={[4, 4, 0, 0]} />;
  if (type === "scatter")
    return <Scatter {...props} data={rows} fill={item.color} />;
  return (
    <Line
      {...props}
      stroke={item.color}
      strokeWidth={2}
      strokeDasharray={index ? "5 4" : ""}
      dot={false}
    />
  );
}
