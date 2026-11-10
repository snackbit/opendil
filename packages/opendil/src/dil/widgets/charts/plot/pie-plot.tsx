import { memo, useCallback, type FocusEvent, type MouseEvent } from "react";
import { useFrameHover, type ChartTarget } from "../chart-hover";
import { useChartInteraction } from "../chart-interaction";

export interface PiePlotProps {
  width: number;
  height: number;
  /** The slices that are shown, in data order. */
  slices: readonly ChartTarget[];
  valueKey: string;
}
export interface Sector {
  target: ChartTarget;
  value: number;
  path: string;
  /** A point inside the ring, where a keyboard reader's tooltip opens. */
  middle: { x: number; y: number };
}
const INNER = 0.48;
const OUTER = 0.78;
const TURN = 2 * Math.PI;
/**
 * The ring's sectors, clockwise from 12 o'clock in data order, as a clock
 * and most pie charts read. Values that are not positive take no share.
 */
export function pieSectors(
  slices: readonly ChartTarget[],
  valueKey: string,
  width: number,
  height: number,
): Sector[] {
  const sized = slices.flatMap((target) => {
    const value = target.row[valueKey];
    return typeof value === "number" && Number.isFinite(value) && value > 0
      ? [{ target, value }]
      : [];
  });
  const total = sized.reduce((sum, slice) => sum + slice.value, 0);
  const cx = width / 2,
    cy = height / 2;
  const radius = Math.min(width, height) / 2;
  const outer = radius * OUTER,
    inner = radius * INNER;
  const at = (angle: number, distance: number) =>
    `${cx + distance * Math.cos(angle)},${cy + distance * Math.sin(angle)}`;
  let start = -TURN / 4;
  return sized.map(({ target, value }) => {
    const sweep = (value / total) * TURN;
    const end = start + sweep;
    const half = start + sweep / 2;
    const large = sweep > TURN / 2 ? 1 : 0;
    // An arc cannot end where it starts: a whole ring is two half rings.
    const path =
      sweep >= TURN - 1e-9
        ? [outer, inner]
            .map(
              (distance) =>
                `M${at(start, distance)}A${distance},${distance} 0 1 1 ${at(half, distance)}` +
                `A${distance},${distance} 0 1 1 ${at(start, distance)}Z`,
            )
            .join("")
        : `M${at(start, outer)}A${outer},${outer} 0 ${large} 1 ${at(end, outer)}` +
          `L${at(end, inner)}A${inner},${inner} 0 ${large} 0 ${at(start, inner)}Z`;
    const ring = (outer + inner) / 2;
    const sector = {
      target,
      value,
      path,
      middle: {
        x: cx + ring * Math.cos(half),
        y: cy + ring * Math.sin(half),
      },
    };
    start = end;
    return sector;
  });
}

/** A donut chart. Each slice takes keyboard focus and reads out its value. */
export const PiePlot = memo(function PiePlot({
  width,
  height,
  slices,
  valueKey,
}: PiePlotProps) {
  const interaction = useChartInteraction();
  const hover = useFrameHover(interaction);
  const sectors = pieSectors(slices, valueKey, width, height);
  const find = (element: Element) =>
    sectors[Number(element.getAttribute("data-sector"))];
  const move = (event: MouseEvent<SVGPathElement>) => {
    const sector = find(event.currentTarget);
    if (sector)
      hover({
        target: { index: sector.target.index, id: sector.target.item.id },
        clientX: event.clientX,
        clientY: event.clientY,
      });
  };
  const leave = useCallback(() => hover(null), [hover]);
  const focus = (event: FocusEvent<SVGPathElement>) => {
    const sector = find(event.currentTarget);
    const box = event.currentTarget.closest("svg")?.getBoundingClientRect();
    if (!sector || !box || !event.currentTarget.matches(":focus-visible"))
      return;
    interaction.hover({
      target: { index: sector.target.index, id: sector.target.item.id },
      clientX: box.left + sector.middle.x,
      clientY: box.top + sector.middle.y,
    });
  };
  const blur = useCallback(() => interaction.hover(null), [interaction]);
  return (
    <svg
      data-dil-plot=""
      className="dil-plot"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <g className="dil-chart-pie">
        {sectors.map(({ target, value, path }, position) => (
          <path
            key={target.item.id}
            data-dil-mark="sector"
            data-sector={position}
            data-series-id={target.item.id}
            className="dil-chart-series"
            d={path}
            fill={target.item.color}
            fillRule="evenodd"
            opacity={`var(--dil-series-${target.index}-opacity, 1)`}
            role="img"
            aria-label={`${target.item.label}: ${value}`}
            tabIndex={0}
            onMouseEnter={move}
            onMouseMove={move}
            onMouseLeave={leave}
            onFocus={focus}
            onBlur={blur}
          />
        ))}
      </g>
    </svg>
  );
});
