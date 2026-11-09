import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

/** Measured widget heights by renderer width (px), then by node id. */
export type HeightsByWidth = Record<string, Record<string, number>>;
/** The dock, a detail view and a resized window each keep their own heights. */
const WIDTH_LIMIT = 4;
const NONE: Readonly<Record<string, number>> = Object.freeze({});

/**
 * Heights of a document's charts, graphs and diagrams, measured when it
 * settled, held by their placeholders the next time it mounts. A diagram that
 * scales to its container is shorter in a narrow dock than in a wide detail
 * view, so heights are kept per renderer width; a width without its own
 * heights uses the nearest one measured, which beats a stock reserve.
 */
export class WidgetHeights {
  /** The width the renderer has now; undefined before its first layout. */
  readonly width = createStore<{ width: number | undefined }>(() => ({
    width: undefined,
  }));
  // Most recently measured last.
  private readonly widths = new Map<number, Readonly<Record<string, number>>>();
  constructor(recorded: HeightsByWidth = {}) {
    for (const [width, heights] of Object.entries(recorded))
      this.widths.set(Number(width), heights);
  }
  /** The heights placeholders reserve at a renderer width. */
  at(width: number | undefined): Readonly<Record<string, number>> {
    const exact = width === undefined ? undefined : this.widths.get(width);
    if (exact) return exact;
    let nearest: number | undefined;
    for (const measured of this.widths.keys())
      if (
        nearest === undefined ||
        width === undefined ||
        Math.abs(measured - width) <= Math.abs(nearest - width)
      )
        nearest = measured;
    return nearest === undefined ? NONE : (this.widths.get(nearest) ?? NONE);
  }
  record(width: number, heights: Readonly<Record<string, number>>) {
    // A hidden renderer (no width, no widget height) measures nothing; an
    // empty entry would evict a width that has measurements.
    if (width <= 0 || !Object.keys(heights).length) return;
    const merged = { ...this.widths.get(width), ...heights };
    this.widths.delete(width);
    this.widths.set(width, merged);
    for (const oldest of this.widths.keys()) {
      if (this.widths.size <= WIDTH_LIMIT) break;
      this.widths.delete(oldest);
    }
  }
  /** The same measurements for another renderer, which has its own width. */
  copy(): WidgetHeights {
    return new WidgetHeights(this.toJSON());
  }
  toJSON(): HeightsByWidth {
    return Object.fromEntries(
      [...this.widths].map(([width, heights]) => [String(width), heights]),
    );
  }
}
/** Snapshots arrive from host storage; keeps positive finite heights only. */
export function readHeights(value: unknown): HeightsByWidth {
  const heights: HeightsByWidth = {};
  if (!value || typeof value !== "object") return heights;
  for (const [width, byNode] of Object.entries(value)) {
    if (!/^\d+$/.test(width) || !byNode || typeof byNode !== "object") continue;
    const valid: Record<string, number> = {};
    for (const [id, height] of Object.entries(byNode))
      if (typeof height === "number" && Number.isFinite(height) && height > 0)
        valid[id] = height;
    if (Object.keys(valid).length) heights[width] = valid;
  }
  return heights;
}
/** The height measured for a widget at the renderer's current width. */
export function useReservedHeight(
  heights: WidgetHeights,
  nodeId: number,
): number | undefined {
  return useStore(heights.width, (state) => heights.at(state.width)[nodeId]);
}
