export interface ChartItem {
  id: string;
  label: string;
  color: string;
}

/** Grafana: isolate on plain click, toggle individually with Ctrl/Cmd. */
export function selectChartItem(
  ids: readonly string[],
  hidden: ReadonlySet<string>,
  id: string,
  toggle: boolean,
): Set<string> {
  if (!ids.includes(id))
    return new Set([...hidden].filter((item) => ids.includes(item)));
  if (toggle) {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }
  const visible = ids.filter((item) => !hidden.has(item));
  return visible.length === 1 && visible[0] === id
    ? new Set()
    : new Set(ids.filter((item) => item !== id));
}
export function reconcileChartSelection(
  ids: readonly string[],
  hidden: ReadonlySet<string>,
): Set<string> {
  return new Set([...hidden].filter((item) => ids.includes(item)));
}
