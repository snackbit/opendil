"use client";

import type { CSSProperties } from "react";
import { cn } from "../../../lib/cn";

/** One value of the hovered datum: a series, or a scatter point's x. */
export interface ChartTooltipEntry {
  dataKey: string;
  name: string;
  value: number | string;
  color: string;
}
export interface ChartTooltipContentProps {
  entries: readonly ChartTooltipEntry[];
  /** The category the entries belong to, as on a line or bar chart. */
  label?: number | string | undefined;
  /** Marks the row whose dataKey matches with `data-emphasized="true"` for styling. */
  emphasizedKey?: string | undefined;
  className?: string | undefined;
}

/** The body of a chart's tooltip: an optional category and one row per value. */
function ChartTooltipContent({
  entries,
  label,
  emphasizedKey,
  className,
}: ChartTooltipContentProps) {
  if (!entries.length) return null;
  return (
    <div
      className={cn(
        "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
        className,
      )}
    >
      {label !== undefined && label !== "" && (
        <div className="font-medium">{label}</div>
      )}
      <div className="grid gap-1.5">
        {entries.map((entry) => (
          <div
            key={entry.dataKey}
            data-emphasized={
              emphasizedKey !== undefined && entry.dataKey === emphasizedKey
                ? "true"
                : undefined
            }
            className="flex w-full flex-wrap items-center gap-2"
          >
            <div
              className="h-2.5 w-2.5 shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)"
              style={
                {
                  "--color-bg": entry.color,
                  "--color-border": entry.color,
                } as CSSProperties
              }
            />
            <div className="flex flex-1 items-center justify-between gap-2 leading-none">
              <span className="text-muted-foreground">{entry.name}</span>
              <span className="font-mono font-medium text-foreground tabular-nums">
                {typeof entry.value === "number"
                  ? entry.value.toLocaleString()
                  : entry.value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { ChartTooltipContent };
