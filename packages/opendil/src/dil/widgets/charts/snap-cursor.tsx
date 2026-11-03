import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MouseEvent,
} from "react";
import { usePlotArea, useXAxisScale, useYAxisScale } from "recharts";
import {
  projectChartPoints,
  nearestChartPoint,
  type ChartPoint,
} from "./chart-snapping";
import type { ChartItem } from "./chart-selection";
export interface ChartHit {
  point: ChartPoint;
  clientX: number;
  clientY: number;
}
export interface SnapCursorProps {
  rows: Record<string, unknown>[];
  items: readonly ChartItem[];
  xKey: string;
  scatter: boolean;
  hit: ChartHit | null;
  onHover: (hit: ChartHit | null) => void;
}
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
  const frame = useRef(0);
  const latest = useRef<ChartHit | null>(null);
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
      latest.current = point
        ? { point, clientX: event.clientX, clientY: event.clientY }
        : null;
      if (!frame.current)
        frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          onHover(latest.current);
        });
    },
    [points, scatter, onHover],
  );
  const leave = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    latest.current = null;
    onHover(null);
  }, [onHover]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  useEffect(() => {
    if (!hit) return;
    const next = points.find(
      (point) =>
        point.index === hit.point.index && point.item.id === hit.point.item.id,
    );
    if (!next) onHover(null);
    else if (next !== hit.point) onHover({ ...hit, point: next });
  }, [points, hit, onHover]);
  if (!area) return null;
  return (
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
      {hit && (
        <g pointerEvents="none" data-chart-snapped-index={hit.point.index}>
          <line
            x1={hit.point.x}
            x2={hit.point.x}
            y1={area.y}
            y2={area.y + area.height}
            stroke="var(--border)"
          />
          {scatter && (
            <line
              x1={area.x}
              x2={area.x + area.width}
              y1={hit.point.y}
              y2={hit.point.y}
              stroke="var(--border)"
            />
          )}
          <circle
            cx={hit.point.x}
            cy={hit.point.y}
            r={5}
            fill={hit.point.item.color}
            stroke="var(--background)"
            strokeWidth={2}
          />
        </g>
      )}
    </g>
  );
}
