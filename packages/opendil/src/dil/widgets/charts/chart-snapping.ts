import type { ChartTarget } from "./chart-hover";
export interface ChartPoint extends ChartTarget {
  x: number;
  y: number;
  value: number;
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
