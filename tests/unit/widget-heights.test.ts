import { expect, it } from "vitest";
import {
  readHeights,
  WidgetHeights,
} from "../../packages/opendil/src/dil/widget-heights";

/*
 * widget-heights.test.ts: widget heights are kept per renderer width, so the
 * dock and the detail view each reserve their own, and storage input that is
 * not a positive height is dropped.
 */
it("reserves the exact width's heights, else the nearest width's", () => {
  const heights = new WidgetHeights({
    "320": { "4": 100 },
    "900": { "4": 300 },
  });
  expect(heights.at(900)).toEqual({ "4": 300 });
  expect(heights.at(400)).toEqual({ "4": 100 });
  expect(heights.at(700)).toEqual({ "4": 300 });
  // Before the first layout: the most recently measured width.
  expect(heights.at(undefined)).toEqual({ "4": 300 });
  expect(new WidgetHeights().at(640)).toEqual({});
});

it("keeps four widths, dropping the least recently measured", () => {
  const heights = new WidgetHeights();
  for (const width of [300, 400, 500, 600])
    heights.record(width, { "1": width });
  // Measuring 300 again makes 400 the oldest.
  heights.record(300, { "2": 5 });
  heights.record(700, { "1": 700 });
  expect(Object.keys(heights.toJSON()).sort()).toEqual([
    "300",
    "500",
    "600",
    "700",
  ]);
  expect(heights.at(300)).toEqual({ "1": 300, "2": 5 });
});

it("ignores a measurement of a hidden renderer, which would evict a real width", () => {
  const heights = new WidgetHeights();
  for (const width of [300, 400, 500, 600])
    heights.record(width, { "1": width });
  heights.record(0, {});
  heights.record(800, {});
  expect(Object.keys(heights.toJSON()).sort()).toEqual([
    "300",
    "400",
    "500",
    "600",
  ]);
});

it("reads only positive finite heights under whole-pixel widths from storage", () => {
  expect(
    readHeights({
      "640": { "1": 120.5, "2": 0, "3": -4, "4": "80", "5": Number.NaN },
      "12.5": { "1": 10 },
      wide: { "1": 10 },
      "900": { "1": 0 },
      "320": null,
    }),
  ).toEqual({ "640": { "1": 120.5 } });
  expect(readHeights(null)).toEqual({});
  expect(readHeights([1, 2])).toEqual({});
});
