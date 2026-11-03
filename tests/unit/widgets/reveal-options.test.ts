import { expect, it } from "vitest";
import {
  readReveal,
  revealTiming,
} from "../../../packages/opendil/src/dil/view/reveal-options";
it("supports the boolean shorthand and custom nonnegative timing", () => {
  expect(revealTiming(false)).toBeNull();
  expect(revealTiming(true)).toEqual({ staggerMs: 50, durationMs: 180 });
  expect(revealTiming({})).toEqual({ staggerMs: 50, durationMs: 180 });
  expect(revealTiming({ staggerMs: 0, durationMs: 240 })).toEqual({
    staggerMs: 0,
    durationMs: 240,
  });
  expect(() => revealTiming({ staggerMs: -1 })).toThrow("nonnegative");
  expect(() => revealTiming({ durationMs: Infinity })).toThrow("finite");
});
it("decodes timing on the isolated-frame boundary", () => {
  expect(readReveal(true)).toBe(true);
  expect(readReveal(false)).toBe(false);
  expect(readReveal({})).toEqual({});
  expect(readReveal({ staggerMs: 0, durationMs: 100 })).toEqual({
    staggerMs: 0,
    durationMs: 100,
  });
  for (const value of [
    null,
    42,
    "true",
    { staggerMs: "50" },
    { durationMs: NaN },
    { staggerMs: -1 },
  ])
    expect(readReveal(value)).toBe(false);
});
