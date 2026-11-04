import { useCallback, useMemo } from "react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "../../../components/ui/overlays/popover";
import { ChartTooltipContent } from "../../../components/ui/display/chart";
import type { ChartItem } from "./chart-selection";
import type { ChartHit } from "./chart-hover";
export interface SnapTooltipProps {
  hit: ChartHit | null;
  items: readonly ChartItem[];
  /** category: x label with every visible series; scatter: x and y; slice: one pie slice. */
  kind: "category" | "scatter" | "slice";
  xKey: string;
  valueKey: string;
  onHover: (hit: ChartHit | null) => void;
}
function keepFocus(event: Event) {
  event.preventDefault();
}
export function SnapTooltip({
  hit,
  items,
  kind,
  xKey,
  valueKey,
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
  const { row, item: target } = hit.target;
  const scatter = kind === "scatter";
  const series = kind === "slice" ? [{ ...target, id: valueKey }] : items;
  const entries = series.flatMap((item) => {
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
  // Bold the hovered series only when it has to stand out from other series rows.
  const emphasized = entries.length > 1 ? target.id : undefined;
  const xValue = row[xKey];
  if (scatter && (typeof xValue === "number" || typeof xValue === "string"))
    entries.unshift({
      graphicalItemId: xKey,
      dataKey: xKey,
      name: xKey,
      value: xValue,
      color: target.color,
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
          emphasizedKey={emphasized}
          {...(kind === "category" &&
          (typeof xValue === "string" || typeof xValue === "number")
            ? { label: xValue }
            : {})}
        />
      </PopoverContent>
    </Popover>
  );
}
