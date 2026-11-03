import type { ChartItem } from "./chart-selection";
export interface ChartPoint {
  index: number;
  item: ChartItem;
  row: Record<string, unknown>;
  x: number;
  y: number;
  value: number;
}
type AxisScale = (
  value: unknown,
  options?: { position: "middle" },
) => number | undefined;
export function projectChartPoints(
  rows: Record<string, unknown>[],
  items: readonly ChartItem[],
  xKey: string,
  xScale: AxisScale,
  yScale: AxisScale,
): ChartPoint[] {
  return rows.flatMap((row, index) =>
    items.flatMap((item) => {
      const value = row[item.id];
      if (typeof value !== "number" || !Number.isFinite(value)) return [];
      const x = xScale(row[xKey], { position: "middle" }),
        y = yScale(value);
      return x !== undefined &&
        y !== undefined &&
        Number.isFinite(x) &&
        Number.isFinite(y)
        ? [{ index, item, row, x, y, value }]
        : [];
    }),
  );
}
export function nearestChartPoint(
  points: readonly ChartPoint[],
  x: number,
  y: number,
  scatter: boolean,
): ChartPoint | undefined {
  let nearest: ChartPoint | undefined;
  let distance = Infinity,
    vertical = Infinity;
  for (const point of points) {
    const dx = Math.abs(point.x - x),
      dy = Math.abs(point.y - y);
    const next = scatter ? Math.hypot(dx, dy) : dx;
    if (next < distance || (next === distance && dy < vertical)) {
      nearest = point;
      distance = next;
      vertical = dy;
    }
  }
  return nearest;
}
