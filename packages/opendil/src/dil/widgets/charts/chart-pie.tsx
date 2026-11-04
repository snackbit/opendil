import {
  memo,
  useCallback,
  useMemo,
  type FocusEvent,
  type MouseEvent,
} from "react";
import { Cell, Pie } from "recharts";
import type { ChartHit, ChartTarget } from "./chart-hover";
export interface ChartPieProps {
  slices: readonly ChartTarget[];
  valueKey: string;
  nameKey: string;
  /** Slice emphasized from the legend. Slice hover and focus emphasis is CSS-only. */
  emphasized: string | null;
  hover: (hit: ChartHit | null) => void;
  highlight: (id: string | null) => void;
}
/**
 * Recharts remounts every sector whenever a Pie re-renders, which loses the
 * pointer and keyboard focus. Memoize the Pie so hover and focus state do not
 * re-render it.
 */
export const ChartPie = memo(function ChartPie({
  slices,
  valueKey,
  nameKey,
  emphasized,
  hover,
  highlight,
}: ChartPieProps) {
  const rows = useMemo(() => slices.map((slice) => slice.row), [slices]);
  const move = useCallback(
    (_sector: unknown, index: number, event: MouseEvent) => {
      const target = slices[index];
      if (target)
        hover({ target, clientX: event.clientX, clientY: event.clientY });
    },
    [slices, hover],
  );
  const leave = useCallback(() => hover(null), [hover]);
  const focus = useCallback(
    (event: FocusEvent<SVGElement>) => {
      if (event.currentTarget.matches(":focus-visible"))
        highlight(event.currentTarget.getAttribute("data-series-id"));
    },
    [highlight],
  );
  const blur = useCallback(() => highlight(null), [highlight]);
  return (
    <Pie
      data={rows}
      dataKey={valueKey}
      nameKey={nameKey}
      innerRadius="48%"
      outerRadius="78%"
      className="dil-chart-pie"
      isAnimationActive={false}
      onMouseEnter={move}
      onMouseMove={move}
      onMouseLeave={leave}
    >
      {slices.map(({ item }) => (
        <Cell
          key={item.id}
          fill={item.color}
          opacity={emphasized !== null && emphasized !== item.id ? 0.625 : 1}
          className="dil-chart-series"
          data-series-id={item.id}
          tabIndex={0}
          onFocus={focus}
          onBlur={blur}
        />
      ))}
    </Pie>
  );
});
