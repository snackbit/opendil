/** A chart's data as the table a copy of the answer shows in its place. */
export interface ChartCopy {
  columns: string[];
  rows: string[][];
}
// Charts register their current data on their root element, so copying needs
// no hidden table in the document and no second representation of the data.
const charts = new WeakMap<Element, () => ChartCopy>();
export function registerChartCopy(element: Element, read: () => ChartCopy) {
  charts.set(element, read);
}
export function chartCopy(element: Element): ChartCopy | null {
  return charts.get(element)?.() ?? null;
}
function cell(value: unknown) {
  return typeof value === "number" || typeof value === "string"
    ? String(value)
    : "";
}
/** One row per data point, one column per field the chart plots. */
export function chartTable(
  columns: readonly { key: string; label: string }[],
  rows: readonly Record<string, unknown>[],
): ChartCopy {
  return {
    columns: columns.map((column) => column.label),
    rows: rows.map((row) => columns.map((column) => cell(row[column.key]))),
  };
}
