import { useCallback, useEffect, useRef } from "react";
import type { ChartItem } from "./chart-selection";
/** The datum under the pointer: one row of one series, or one pie slice. */
export interface ChartTarget {
  index: number;
  item: ChartItem;
  row: Record<string, unknown>;
}
export interface ChartHit {
  target: ChartTarget;
  clientX: number;
  clientY: number;
}
/**
 * Coalesces pointer updates to one per animation frame. The latest update wins,
 * so leaving one mark and entering the next does not close and reopen the tooltip.
 */
export function useFrameHover(onHover: (hit: ChartHit | null) => void) {
  const frame = useRef(0);
  const latest = useRef<ChartHit | null>(null);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return useCallback(
    (hit: ChartHit | null) => {
      latest.current = hit;
      if (!frame.current)
        frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          onHover(latest.current);
        });
    },
    [onHover],
  );
}
