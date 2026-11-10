import { createContext, useContext } from "react";
import { createStore } from "zustand/vanilla";
import type { ChartHit } from "./chart-hover";

export interface ChartInteractionState {
  /** The datum under the pointer or the keyboard; its series is emphasized. */
  hit: ChartHit | null;
  legendHovered: string | null;
}
/** The series to emphasize: the legend entry in use, else the hovered datum's. */
export const emphasizedSeries = (state: ChartInteractionState) =>
  state.legendHovered ?? state.hit?.target.id ?? null;

/** Pointer movement must not render the chart's axes, data, or container. */
export function createChartInteraction() {
  let model: { ids: ReadonlySet<string>; rows: number } | null = null;
  let hoverRevision = 0;
  const store = createStore<ChartInteractionState>(() => ({
    hit: null,
    legendHovered: null,
  }));
  return {
    store,
    get hoverRevision() {
      return hoverRevision;
    },
    hover(hit: ChartHit | null) {
      // Immediate keyboard/focus/dismissal input supersedes queued pointer work,
      // including a dismissal that does not change the current store value.
      hoverRevision++;
      // A sample queued before a metric switch must not restore the old target.
      if (
        hit &&
        model &&
        (!model.ids.has(hit.target.id) ||
          hit.target.index < 0 ||
          hit.target.index >= model.rows)
      )
        return;
      const previous = store.getState();
      if (!hit) {
        if (previous.hit !== null) store.setState({ hit: null });
        return;
      }
      const oldTarget = previous.hit?.target;
      const sameTarget =
        oldTarget?.index === hit.target.index && oldTarget.id === hit.target.id;
      if (
        sameTarget &&
        previous.hit?.clientX === hit.clientX &&
        previous.hit.clientY === hit.clientY
      )
        return;
      // Cursor and emphasis subscribers see no change when only the pointer moves.
      const target = sameTarget && oldTarget ? oldTarget : hit.target;
      store.setState({
        hit: { target, clientX: hit.clientX, clientY: hit.clientY },
      });
    },
    highlightLegend(legendHovered: string | null) {
      // Hidden entries remain selectable in the legend, but cannot emphasize
      // an absent series or mute the visible series and their labels.
      if (legendHovered !== null && model && !model.ids.has(legendHovered))
        legendHovered = null;
      if (store.getState().legendHovered !== legendHovered)
        store.setState({ legendHovered });
    },
    reconcile(ids: readonly string[], rows: number) {
      model = { ids: new Set(ids), rows };
      const previous = store.getState();
      const hit =
        previous.hit &&
        ids.includes(previous.hit.target.id) &&
        previous.hit.target.index >= 0 &&
        previous.hit.target.index < rows
          ? previous.hit
          : null;
      const legendHovered =
        previous.legendHovered !== null && ids.includes(previous.legendHovered)
          ? previous.legendHovered
          : null;
      if (hit !== previous.hit || legendHovered !== previous.legendHovered)
        store.setState({ hit, legendHovered });
    },
  };
}

export const ChartInteractionContext = createContext<ReturnType<
  typeof createChartInteraction
> | null>(null);

export function useChartInteraction() {
  const interaction = useContext(ChartInteractionContext);
  if (!interaction) throw new Error("Chart interaction scope is missing");
  return interaction;
}
