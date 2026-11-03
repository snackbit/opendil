import { expect, it } from "vitest";
import {
  nearestChartPoint,
  projectChartPoints,
} from "../../../packages/opendil/src/dil/widgets/charts/chart-snapping";
const items = [{ id: "y", label: "Series", color: "blue" }];
const scale = (value: unknown) =>
  typeof value === "number" ? value * 2 : undefined;
it("projects only valid values through the actual chart scales", () => {
  const points = projectChartPoints(
    [
      { x: 2, y: 3 },
      { x: "bad", y: 1 },
      { x: 1, y: "bad" },
      { x: 1, y: Infinity },
    ],
    items,
    "x",
    scale,
    scale,
  );
  expect(points).toHaveLength(1);
  expect(points[0]).toMatchObject({ index: 0, x: 4, y: 6, value: 3 });
  expect(
    projectChartPoints([{ x: 1, y: 1 }], items, "x", scale, () => undefined),
  ).toEqual([]);
  expect(
    projectChartPoints([{ x: 1, y: 1 }], items, "x", () => NaN, scale),
  ).toEqual([]);
  expect(
    projectChartPoints([{ x: 1, y: 1 }], items, "x", scale, () => Infinity),
  ).toEqual([]);
});
it("uses spatial proximity for scatter and nearest x followed by y for series charts", () => {
  const points = projectChartPoints(
    [
      { x: 1, y: 90 },
      { x: 5, y: 10 },
    ],
    items,
    "x",
    scale,
    scale,
  );
  expect(nearestChartPoint(points, 3, 20, true)?.index).toBe(1);
  expect(nearestChartPoint(points, 3, 20, false)?.index).toBe(0);
  expect(nearestChartPoint([], 1, 1, true)).toBeUndefined();
  const tied = [...points, { ...points[0]!, y: 10 }];
  expect(nearestChartPoint(tied, 2, 11, false)?.y).toBe(10);
});
