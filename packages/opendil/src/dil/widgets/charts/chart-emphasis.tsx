import { useLayoutEffect, type RefObject } from "react";
import { useStore } from "zustand";
import type { ChartItem } from "./chart-selection";
import { emphasizedSeries, useChartInteraction } from "./chart-interaction";

export interface ChartEmphasisProps {
  root: RefObject<HTMLDivElement | null>;
  items: readonly ChartItem[];
}

/** Series emphasis as custom properties on the chart: hovering renders no marks. */
export function ChartEmphasis({ root, items }: ChartEmphasisProps) {
  const { store } = useChartInteraction();
  const active = useStore(store, emphasizedSeries);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const shown = items.some((item) => item.id === active);
    items.forEach((item, index) => {
      const property = `--dil-series-${index}-opacity`;
      // Unset means full opacity, the fallback of the series' var(). A chart
      // nobody hovers then writes no style when it mounts, so a commit of
      // several charts keeps one layout.
      const value = shown && item.id !== active ? "0.625" : "";
      if (element.style.getPropertyValue(property) === value) return;
      if (value) element.style.setProperty(property, value);
      else element.style.removeProperty(property);
    });
  }, [root, items, active]);
  return null;
}
