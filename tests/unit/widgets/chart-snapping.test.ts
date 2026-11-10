import { expect, it } from "vitest";
import {
  nearestChartPoint,
  type ChartPoint,
} from "../../../packages/opendil/src/dil/widgets/charts/chart-snapping";
const item = { id: "y", label: "Series", color: "blue" };
const point = (index: number, x: number, y: number): ChartPoint => ({
  index,
  item,
  row: {},
  x,
  y,
  value: y,
});
it("uses spatial proximity for scatter and nearest x followed by y for series charts", () => {
  const points = [point(0, 2, 180), point(1, 10, 20)];
  expect(nearestChartPoint(points, 3, 20, true)?.index).toBe(1);
  expect(nearestChartPoint(points, 3, 20, false)?.index).toBe(0);
  expect(nearestChartPoint([], 1, 1, true)).toBeUndefined();
  const tied = [...points, point(0, 2, 10)];
  expect(nearestChartPoint(tied, 2, 11, false)?.y).toBe(10);
});
