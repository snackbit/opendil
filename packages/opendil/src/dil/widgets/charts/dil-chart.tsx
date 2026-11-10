"use client";
import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { record, text } from "../primitives/attribute-values";
import { ChartLegend } from "./chart-legend";
import { chartTable, registerChartCopy } from "../../serialize/chart-copy";
import {
  ChartInteractionContext,
  createChartInteraction,
} from "./chart-interaction";
import { ChartEmphasis } from "./chart-emphasis";
import { SnapTooltip } from "./snap-tooltip";
import {
  selectChartItem,
  reconcileChartSelection,
  type ChartItem,
} from "./chart-selection";
import { CartesianPlot } from "./plot/cartesian-plot";
import { PiePlot } from "./plot/pie-plot";
import { usePlotWidth } from "./plot/use-plot-size";
export interface DilChartProps {
  content: unknown;
  presentationRef?: ((element: HTMLElement | null) => void) | undefined;
}
// --dil-chart-N lets a host color charts without redefining the shadcn
// --chart-N variables its own components read; the stock colors apply when
// neither is set, as under theme="inherit" on a page without them. Eight
// slots let a host palette of up to eight colors map one to one before
// series repeat colors.
const STOCK_CHART_COLORS = [
  "#6580d9",
  "#47a98a",
  "#d4a458",
  "#ac81cc",
  "#d78675",
  "#4ea3c4",
  "#c77aa0",
  "#8f9b52",
];
const PALETTE = STOCK_CHART_COLORS.map(
  (color, index) =>
    `var(--dil-chart-${index + 1}, var(--chart-${index + 1}, ${color}))`,
);
const PLOT_HEIGHT = 248;
function palette(index: number) {
  return PALETTE[index % PALETTE.length] ?? "var(--chart-1)";
}
/**
 * A line, bar, scatter or donut chart drawn as SVG from its data. Pointer
 * movement reaches only the cursor, the tooltip and the series emphasis;
 * new data redraws the marks without measuring anything.
 */
export function DilChart({ content, presentationRef }: DilChartProps) {
  const [interaction] = useState(createChartInteraction);
  const [width, measure] = usePlotWidth();
  const root = useRef<HTMLDivElement | null>(null);
  const data = useMemo(() => record(content), [content]);
  const rows = useMemo(
    () => (Array.isArray(data.data) ? data.data.map(record) : []),
    [data.data],
  );
  const series = useMemo(
    () => (Array.isArray(data.series) ? data.series.map(record) : []),
    [data.series],
  );
  const type = text(data.chartType);
  const items = useMemo<ChartItem[]>(
    () =>
      type === "pie"
        ? rows.map((row, index) => ({
            id: text(row[text(data.nameKey)], String(index)),
            label: text(row[text(data.nameKey)], String(index)),
            color: palette(index),
          }))
        : series.map((item, index) => ({
            id: text(item.dataKey),
            label: text(item.label, text(item.dataKey)),
            color: palette(index),
          })),
    [type, rows, series, data.nameKey],
  );
  const ids = items.map((item) => item.id);
  const identity = JSON.stringify(ids);
  const [selection, setSelection] = useState({
    identity,
    hidden: new Set<string>(),
  });
  if (selection.identity !== identity)
    setSelection({
      identity,
      hidden: reconcileChartSelection(ids, selection.hidden),
    });
  const visibleItems = useMemo(
    () => items.filter((item) => !selection.hidden.has(item.id)),
    [items, selection.hidden],
  );
  useLayoutEffect(() => {
    interaction.reconcile(
      visibleItems.map((item) => item.id),
      rows.length,
    );
  }, [interaction, visibleItems, rows.length]);
  const select = useCallback(
    (id: string, toggle: boolean) => {
      const ids: string[] = JSON.parse(identity);
      setSelection((previous) => ({
        identity,
        hidden: selectChartItem(ids, previous.hidden, id, toggle),
      }));
    },
    [identity],
  );
  const slices = useMemo(
    () =>
      rows.flatMap((row, index) => {
        const item = items[index];
        return item && !selection.hidden.has(item.id)
          ? [{ index, row, item }]
          : [];
      }),
    [rows, items, selection.hidden],
  );
  const title = text(data.title);
  const description = text(data.description);
  const descriptionId = useId();
  const xLabel = text(data.xLabel);
  const yLabel = text(data.yLabel);
  const xKey = text(data.xKey);
  const columns =
    type === "pie"
      ? [
          { key: text(data.nameKey), label: text(data.nameKey) },
          { key: text(data.valueKey), label: text(data.valueKey) },
        ]
      : [
          { key: xKey, label: xLabel || xKey },
          ...series
            .filter((item) => !selection.hidden.has(text(item.dataKey)))
            .map((item) => ({
              key: text(item.dataKey),
              label: text(item.label, text(item.dataKey)),
            })),
        ];
  // Copies of the answer read the data the chart shows now: series and
  // slices hidden through the legend are left out.
  const shownRows = type === "pie" ? slices.map((slice) => slice.row) : rows;
  const latest = useRef({ columns, rows: shownRows });
  useLayoutEffect(() => {
    latest.current = { columns, rows: shownRows };
  });
  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      root.current = element;
      presentationRef?.(element);
      if (element)
        registerChartCopy(element, () =>
          chartTable(latest.current.columns, latest.current.rows),
        );
    },
    [presentationRef],
  );
  return (
    <ChartInteractionContext.Provider value={interaction}>
      <div
        ref={attach}
        role="group"
        aria-label={title || type + " chart"}
        {...(description ? { "aria-describedby": descriptionId } : {})}
        data-chart-type={type}
        data-points={rows.length}
        data-dil-copy="chart"
      >
        <ChartEmphasis root={root} items={items} />
        {title && (
          <p data-dil-chart-title="" className="mb-1 text-sm font-semibold">
            {title}
          </p>
        )}
        {description && (
          <p
            id={descriptionId}
            data-dil-chart-description=""
            className="mb-2 text-xs text-muted-foreground"
          >
            {description}
          </p>
        )}
        <div
          ref={measure}
          data-slot="chart"
          className="w-full overflow-hidden text-xs"
          style={{ height: PLOT_HEIGHT }}
        >
          {type === "pie" ? (
            <PiePlot
              width={width}
              height={PLOT_HEIGHT}
              slices={slices}
              valueKey={text(data.valueKey)}
            />
          ) : (
            <CartesianPlot
              type={type === "bar" || type === "scatter" ? type : "line"}
              width={width}
              height={PLOT_HEIGHT}
              rows={rows}
              items={items}
              hidden={selection.hidden}
              xKey={xKey}
              xLabel={xLabel}
              yLabel={yLabel}
            />
          )}
          <SnapTooltip
            rows={rows}
            items={visibleItems}
            kind={
              type === "pie"
                ? "slice"
                : type === "scatter"
                  ? "scatter"
                  : "category"
            }
            xKey={xKey}
            valueKey={text(data.valueKey)}
          />
        </div>
        <ChartLegend
          items={items}
          hidden={selection.hidden}
          select={select}
          interactive={
            (type === "bar" || type === "line" || type === "") &&
            items.length > 1
          }
        />
      </div>
    </ChartInteractionContext.Provider>
  );
}
