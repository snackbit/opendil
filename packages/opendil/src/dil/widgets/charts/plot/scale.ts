/** Maps a value to a pixel position, or nothing for a value off the axis. */
export type AxisScale = (value: unknown) => number | undefined;
export interface NumericAxis {
  /** Tick values in ascending order; the first and last bound the domain. */
  ticks: number[];
  min: number;
  max: number;
}
// Steps between ticks, as multiples of a power of ten.
const STEPS = [1, 2, 2.5, 4, 5, 10];
/** Removes the binary noise of a product such as 3 * 0.1. */
const clean = (value: number) => Number(value.toPrecision(12));
/**
 * An axis of evenly spaced round ticks, about `count` of them, that covers
 * the values and includes zero, so bars and lines read against a baseline.
 */
export function numericAxis(values: readonly number[], count = 5): NumericAxis {
  let low = 0,
    high = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < low) low = value;
    if (value > high) high = value;
  }
  // Nothing to scale: any axis shows the flat line at zero.
  if (low === high) high = low + 1;
  const magnitude = 10 ** Math.floor(Math.log10((high - low) / count));
  // The smallest round step that covers the values in `count` intervals.
  // Aligning the first tick to the step can need one more interval than the
  // range alone, so each step is tried rather than derived.
  for (let power = magnitude; ; power *= 10)
    for (const multiple of STEPS) {
      const step = multiple * power;
      const first = Math.floor(low / step);
      const last = Math.ceil(high / step);
      if (last - first > count) continue;
      const ticks = Array.from({ length: last - first + 1 }, (_, index) =>
        clean((first + index) * step),
      );
      return { ticks, min: ticks[0]!, max: ticks.at(-1)! };
    }
}
/** Positions numbers of a domain along a pixel range, in either direction. */
export function linearScale(
  axis: Pick<NumericAxis, "min" | "max">,
  start: number,
  end: number,
): AxisScale {
  const span = axis.max - axis.min;
  return (value) =>
    typeof value === "number" && Number.isFinite(value)
      ? start + ((value - axis.min) / span) * (end - start)
      : undefined;
}
export interface Bands {
  /** Width of one category's slot. */
  step: number;
  /** Center of the category at an index. */
  center(index: number): number;
}
/** Equal slots for categories that own an area, such as groups of bars. */
export function bands(count: number, start: number, end: number): Bands {
  const step = count > 0 ? (end - start) / count : 0;
  return { step, center: (index) => start + step * (index + 0.5) };
}
/**
 * Categories as points from edge to edge, as a line reads: the first value
 * at the start of the axis and the last at its end. One point sits in the
 * middle.
 */
export function points(count: number, start: number, end: number): Bands {
  if (count < 2) return { step: 0, center: () => (start + end) / 2 };
  const step = (end - start) / (count - 1);
  return { step, center: (index) => start + step * index };
}
/** A tick's label: the number as written, without grouping. */
export function formatTick(value: number): string {
  return String(value);
}
