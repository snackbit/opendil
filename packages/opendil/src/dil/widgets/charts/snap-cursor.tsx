import { useCallback, useEffect, useMemo, type MouseEvent } from "react";
import {
  DefaultZIndexes,
  ZIndexLayer,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
} from "recharts";
import { projectChartPoints, nearestChartPoint } from "./chart-snapping";
import { useFrameHover, type ChartHit } from "./chart-hover";
import type { ChartItem } from "./chart-selection";
export interface SnapCursorProps {
  rows: Record<string, unknown>[];
  items: readonly ChartItem[];
  xKey: string;
  scatter: boolean;
  hit: ChartHit | null;
  onHover: (hit: ChartHit | null) => void;
}
/** Line and scatter hover: snap from anywhere in the plot to the nearest datum. */
export function SnapCursor({
  rows,
  items,
  xKey,
  scatter,
  hit,
  onHover,
}: SnapCursorProps) {
  const area = usePlotArea(),
    xScale = useXAxisScale(),
    yScale = useYAxisScale();
  const hover = useFrameHover(onHover);
  const points = useMemo(
    () =>
      xScale && yScale
        ? projectChartPoints(rows, items, xKey, xScale, yScale)
        : [],
    [rows, items, xKey, xScale, yScale],
  );
  const move = useCallback(
    (event: MouseEvent<SVGRectElement>) => {
      event.stopPropagation();
      const matrix = event.currentTarget.getScreenCTM();
      if (!matrix) return;
      const cursor = new DOMPoint(event.clientX, event.clientY).matrixTransform(
        matrix.inverse(),
      );
      const point = nearestChartPoint(points, cursor.x, cursor.y, scatter);
      hover(
        point
          ? { target: point, clientX: event.clientX, clientY: event.clientY }
          : null,
      );
    },
    [points, scatter, hover],
  );
  const leave = useCallback(() => hover(null), [hover]);
  const snapped = hit
    ? points.find(
        (point) =>
          point.index === hit.target.index &&
          point.item.id === hit.target.item.id,
      )
    : undefined;
  // Follow streamed or filtered data: refresh the hovered datum or drop it.
  useEffect(() => {
    if (!hit) return;
    if (!snapped) onHover(null);
    else if (snapped !== hit.target) onHover({ ...hit, target: snapped });
  }, [hit, snapped, onHover]);
  if (!area) return null;
  // Recharts paints lines and scatter points in higher z-index layers than custom
  // children. Without this layer the marks would cover the hit area and hand
  // hovering over to the stock Recharts tooltip.
  return (
    <ZIndexLayer zIndex={DefaultZIndexes.activeDot + 1}>
      <g aria-hidden="true">
        <rect
          data-chart-hit-area=""
          x={area.x}
          y={area.y}
          width={area.width}
          height={area.height}
          fill="transparent"
          onMouseMove={move}
          onMouseLeave={leave}
        />
        {snapped && (
          <g pointerEvents="none" data-chart-snapped-index={snapped.index}>
            <line
              x1={snapped.x}
              x2={snapped.x}
              y1={area.y}
              y2={area.y + area.height}
              stroke="var(--border)"
            />
            {scatter && (
              <line
                x1={area.x}
                x2={area.x + area.width}
                y1={snapped.y}
                y2={snapped.y}
                stroke="var(--border)"
              />
            )}
            <circle
              cx={snapped.x}
              cy={snapped.y}
              r={5}
              fill={snapped.item.color}
              stroke="var(--background)"
              strokeWidth={2}
            />
          </g>
        )}
      </g>
    </ZIndexLayer>
  );
}
