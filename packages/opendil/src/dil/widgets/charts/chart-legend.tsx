import {
  useCallback,
  type KeyboardEvent,
  type MouseEvent,
  type FocusEvent,
} from "react";
import { Button } from "../../../components/ui/controls/button";
import type { ChartItem } from "./chart-selection";
interface LegendItemProps {
  item: ChartItem;
  hidden: boolean;
  muted: boolean;
  select: (id: string, toggle: boolean) => void;
  highlight: (id: string | null) => void;
  interactive: boolean;
}
function LegendItem({
  item,
  hidden,
  muted,
  select,
  highlight,
  interactive,
}: LegendItemProps) {
  const click = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (interactive) select(item.id, event.ctrlKey || event.metaKey);
    },
    [item.id, select, interactive],
  );
  const key = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (interactive && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        select(item.id, event.ctrlKey || event.metaKey);
      }
    },
    [item.id, select, interactive],
  );
  const enter = useCallback(() => highlight(item.id), [item.id, highlight]);
  const leave = useCallback(() => highlight(null), [highlight]);
  const focus = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      if (event.currentTarget.matches(":focus-visible")) highlight(item.id);
    },
    [item.id, highlight],
  );
  const Element = interactive ? Button : "span";
  return (
    <Element
      {...(interactive
        ? {
            type: "button" as const,
            variant: "ghost" as const,
            size: "xs" as const,
            "aria-pressed": !hidden,
          }
        : { tabIndex: 0 })}
      className="dil-legend-item"
      data-series-id={item.id}
      data-muted={muted}
      data-hidden={hidden}
      onClick={click}
      onKeyDown={key}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={focus}
      onBlur={leave}
    >
      <span
        aria-hidden="true"
        className="dil-legend-swatch"
        style={{ backgroundColor: item.color }}
      />
      {item.label}
    </Element>
  );
}
export interface ChartLegendProps {
  items: readonly ChartItem[];
  hidden: ReadonlySet<string>;
  hovered: string | null;
  select: (id: string, toggle: boolean) => void;
  highlight: (id: string | null) => void;
  interactive: boolean;
}
export function ChartLegend({
  items,
  hidden,
  hovered,
  select,
  highlight,
  interactive,
}: ChartLegendProps) {
  return (
    <div className="dil-chart-legend" role="group" aria-label="Chart legend">
      {items.map((item) => (
        <LegendItem
          key={item.id}
          item={item}
          hidden={hidden.has(item.id)}
          muted={hovered !== null && hovered !== item.id}
          select={select}
          highlight={highlight}
          interactive={interactive}
        />
      ))}
    </div>
  );
}
