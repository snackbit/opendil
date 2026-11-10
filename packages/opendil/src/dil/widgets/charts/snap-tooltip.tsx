import { useCallback, useMemo } from "react";
import { useStore } from "zustand";
import { ChartTooltipContent } from "../../../components/ui/display/chart";
import type { ChartItem } from "./chart-selection";
import { useChartInteraction } from "./chart-interaction";
import { ChartPointTooltip } from "./chart-point-tooltip";
export interface SnapTooltipProps {
  rows: Record<string, unknown>[];
  items: readonly ChartItem[];
  /** category: x label with every visible series; scatter: x and y; slice: one pie slice. */
  kind: "category" | "scatter" | "slice";
  xKey: string;
  valueKey: string;
}
export function SnapTooltip({
  rows,
  items,
  kind,
  xKey,
  valueKey,
}: SnapTooltipProps) {
  const { store, hover } = useChartInteraction();
  const hit = useStore(store, (state) => state.hit);
  const key = hit?.target;
  const target = useMemo(() => {
    // Prepare the tooltip's DOM and text metrics while the chart mounts.
    // First hover only updates its values and position.
    if (!key) {
      const row = rows[0],
        item = items[0];
      return row && item ? { row, item } : null;
    }
    const row = rows[key.index];
    const item = items.find((item) => item.id === key.id);
    return row && item ? { row, item } : null;
  }, [key, rows, items]);
  const x = hit?.clientX ?? 0,
    y = hit?.clientY ?? 0;
  const close = useCallback(() => hover(null), [hover]);
  // Coordinates only reposition the anchor; payloads and content stay unchanged.
  const content = useMemo(() => {
    if (!target) return null;
    const { row, item } = target;
    const scatter = kind === "scatter";
    const series = kind === "slice" ? [{ ...item, id: valueKey }] : items;
    const entries = series.flatMap((item) => {
      const value = row[item.id];
      return typeof value === "number" || typeof value === "string"
        ? [{ dataKey: item.id, name: item.label, value, color: item.color }]
        : [];
    });
    // Bold the hovered series only when it has to stand out from other series rows.
    const emphasized = entries.length > 1 ? item.id : undefined;
    const xValue = row[xKey];
    const positioned = typeof xValue === "number" || typeof xValue === "string";
    if (scatter && positioned)
      entries.unshift({
        dataKey: xKey,
        name: xKey,
        value: xValue,
        color: item.color,
      });
    return (
      <ChartTooltipContent
        entries={entries}
        emphasizedKey={emphasized}
        {...(kind === "category" && positioned ? { label: xValue } : {})}
      />
    );
  }, [target, items, kind, xKey, valueKey]);
  return (
    <ChartPointTooltip
      open={hit !== null && target !== null}
      x={x}
      y={y}
      onClose={close}
    >
      {content}
    </ChartPointTooltip>
  );
}
