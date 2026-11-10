import { useCallback, useEffect, useRef } from "react";
import type { ChartItem } from "./chart-selection";
import type { createChartInteraction } from "./chart-interaction";
/** The datum under the pointer: one row of one series, or one pie slice. */
export interface ChartTarget {
  index: number;
  item: ChartItem;
  row: Record<string, unknown>;
}
export interface ChartHit {
  /** Projected coordinates and row objects are derived, never retained in hover state. */
  target: { index: number; id: string };
  clientX: number;
  clientY: number;
}
/**
 * Coalesces pointer updates to one per animation frame. The latest update wins,
 * so leaving one mark and entering the next does not close and reopen the tooltip.
 */
export function useFrameHover(
  interaction: ReturnType<typeof createChartInteraction>,
) {
  const frame = useRef(0);
  const latest = useRef<{ hit: ChartHit | null; revision: number }>({
    hit: null,
    revision: 0,
  });
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      latest.current = { hit: null, revision: 0 };
    },
    [],
  );
  return useCallback(
    (hit: ChartHit | null) => {
      latest.current = { hit, revision: interaction.hoverRevision };
      if (!frame.current)
        frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          const sample = latest.current;
          if (sample.revision === interaction.hoverRevision)
            interaction.hover(sample.hit);
        });
    },
    [interaction],
  );
}
