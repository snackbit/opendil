import { useCallback, useMemo } from "react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "../../../components/ui/overlays/popover";
import { ChartTooltipContent } from "../../../components/ui/display/chart";
import type { ChartItem } from "./chart-selection";
import type { ChartHit } from "./snap-cursor";
export interface SnapTooltipProps {
  hit: ChartHit | null;
  items: readonly ChartItem[];
  xKey: string;
  scatter: boolean;
  onHover: (hit: ChartHit | null) => void;
}
function keepFocus(event: Event) {
  event.preventDefault();
}
export function SnapTooltip({
  hit,
  items,
  xKey,
  scatter,
  onHover,
}: SnapTooltipProps) {
  const x = hit?.clientX ?? 0,
    y = hit?.clientY ?? 0;
  const virtualRef = useMemo(
    () => ({
      current: { getBoundingClientRect: () => new DOMRect(x, y, 0, 0) },
    }),
    [x, y],
  );
  const close = useCallback(
    (open: boolean) => {
      if (!open) onHover(null);
    },
    [onHover],
  );
  if (!hit) return null;
  const row = hit.point.row;
  const entries = items.flatMap((item) => {
    const value = row[item.id];
    return typeof value === "number" || typeof value === "string"
      ? [
          {
            graphicalItemId: item.id,
            dataKey: item.id,
            name: item.label,
            value,
            color: item.color,
            payload: row,
          },
        ]
      : [];
  });
  const xValue = row[xKey];
  if (scatter && (typeof xValue === "number" || typeof xValue === "string"))
    entries.unshift({
      graphicalItemId: xKey,
      dataKey: xKey,
      name: xKey,
      value: xValue,
      color: hit.point.item.color,
      payload: row,
    });
  return (
    <Popover open onOpenChange={close}>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        role="tooltip"
        side="bottom"
        align="start"
        sideOffset={12}
        collisionPadding={8}
        onOpenAutoFocus={keepFocus}
        onCloseAutoFocus={keepFocus}
        className="dil-snap-tooltip w-auto border-0 bg-transparent p-0 shadow-none"
      >
        <ChartTooltipContent
          active
          payload={entries}
          {...(!scatter &&
          (typeof xValue === "string" || typeof xValue === "number")
            ? { label: xValue }
            : {})}
        />
      </PopoverContent>
    </Popover>
  );
}
