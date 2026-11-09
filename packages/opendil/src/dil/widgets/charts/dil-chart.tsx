"use client";
import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
} from "react";
import {
  BarChart,
  CartesianGrid,
  LineChart,
  PieChart,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "../../../components/ui/display/chart";
import { record, text } from "../primitives/attribute-values";
import { ChartLegend } from "./chart-legend";
import { chartTable, registerChartCopy } from "../../serialize/chart-copy";
import { ChartPie } from "./chart-pie";
import { ChartSeries } from "./chart-series";
import { SnapCursor } from "./snap-cursor";
import { useFrameHover, type ChartHit } from "./chart-hover";
import { SnapTooltip } from "./snap-tooltip";
import {
  selectChartItem,
  reconcileChartSelection,
  type ChartItem,
} from "./chart-selection";
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
function palette(index: number) {
  return PALETTE[index % PALETTE.length] ?? "var(--chart-1)";
}
export function DilChart({ content, presentationRef }: DilChartProps) {
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
  const [hovered, setHovered] = useState<string | null>(null);
  const [hit, setHit] = useState<ChartHit | null>(null);
  const onHover = useCallback((next: ChartHit | null) => {
    setHit(next);
    setHovered(next?.target.item.id ?? null);
  }, []);
  const hover = useFrameHover(onHover);
  // Pointer hover belongs to the snap tooltip. The stock Recharts tooltip, its
  // cursor, and active dots are off unless the chart surface has keyboard focus,
  // where they serve arrow-key navigation. Recharts tracks pointer moves on its
  // own (bar charts let them through), so off has to be the default.
  const [keyboard, setKeyboard] = useState(false);
  const focusIn = useCallback((event: FocusEvent<HTMLElement>) => {
    const target = event.target;
    setKeyboard(
      target.classList.contains("recharts-surface") &&
        target.matches(":focus-visible"),
    );
  }, []);
  const focusOut = useCallback(() => setKeyboard(false), []);
  const stockActive = keyboard && hit === null;
  const visibleItems = useMemo(
    () => items.filter((item) => !selection.hidden.has(item.id)),
    [items, selection.hidden],
  );
  // Legend hover is separate from chart hover: only legend hover re-renders pie
  // slices, while slice hover and focus emphasis stay in CSS (see ChartPie).
  const [legendHovered, setLegendHovered] = useState<string | null>(null);
  const shown = (id: string | null) =>
    id !== null && ids.includes(id) && !selection.hidden.has(id) ? id : null;
  const emphasized = shown(legendHovered);
  const active = emphasized ?? shown(hovered);
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
  const highlight = useCallback((id: string | null) => setHovered(id), []);
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
  const config: ChartConfig = Object.fromEntries(
    series.map((item, index) => [
      text(item.dataKey),
      { label: text(item.label), color: palette(index) },
    ]),
  );
  const marks = items.map((item, index) => (
    <ChartSeries
      key={item.id}
      item={item}
      index={index}
      type={type}
      hidden={selection.hidden.has(item.id)}
      muted={active !== null && active !== item.id}
      rows={rows}
      highlight={highlight}
      hover={hover}
      markers={stockActive}
    />
  ));
  const stockTooltip = (
    <ChartTooltip
      content={<ChartTooltipContent />}
      isAnimationActive={false}
      {...(stockActive ? {} : { active: false, cursor: false })}
    />
  );
  const title = text(data.title);
  const description = text(data.description);
  const descriptionId = useId();
  const xLabel = text(data.xLabel);
  const yLabel = text(data.yLabel);
  const axes = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis
        dataKey={text(data.xKey)}
        type={type === "scatter" ? "number" : "category"}
        tickLine={false}
        axisLine={false}
        {...(xLabel
          ? {
              height: 44,
              label: { value: xLabel, position: "insideBottom", offset: 0 },
            }
          : {})}
      />
      <YAxis
        {...(type === "scatter"
          ? { dataKey: text(series[0]?.dataKey), type: "number" as const }
          : {})}
        tickLine={false}
        axisLine={false}
        width={yLabel ? 64 : 45}
        {...(yLabel
          ? {
              label: {
                value: yLabel,
                angle: -90,
                position: "insideLeft",
                style: { textAnchor: "middle" },
              },
            }
          : {})}
      />
      {stockTooltip}
    </>
  );
  const columns =
    type === "pie"
      ? [
          { key: text(data.nameKey), label: text(data.nameKey) },
          { key: text(data.valueKey), label: text(data.valueKey) },
        ]
      : [
          { key: text(data.xKey), label: xLabel || text(data.xKey) },
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
      presentationRef?.(element);
      if (element)
        registerChartCopy(element, () =>
          chartTable(latest.current.columns, latest.current.rows),
        );
    },
    [presentationRef],
  );
  const cursor = (
    <SnapCursor
      rows={rows}
      items={visibleItems}
      xKey={text(data.xKey)}
      scatter={type === "scatter"}
      hit={hit}
      onHover={onHover}
    />
  );
  let chart;
  if (type === "pie")
    chart = (
      <PieChart>
        {stockTooltip}
        <ChartPie
          slices={slices}
          valueKey={text(data.valueKey)}
          nameKey={text(data.nameKey)}
          emphasized={emphasized}
          hover={hover}
          highlight={highlight}
        />
      </PieChart>
    );
  else if (type === "bar")
    chart = (
      <BarChart data={rows}>
        {axes}
        {marks}
      </BarChart>
    );
  else if (type === "scatter")
    chart = (
      <ScatterChart>
        {axes}
        {marks}
        {cursor}
      </ScatterChart>
    );
  else
    chart = (
      <LineChart data={rows}>
        {axes}
        {marks}
        {cursor}
      </LineChart>
    );
  return (
    <div
      ref={attach}
      role="group"
      aria-label={title || type + " chart"}
      {...(description ? { "aria-describedby": descriptionId } : {})}
      data-chart-type={type}
      data-points={rows.length}
      data-dil-copy="chart"
      onFocus={focusIn}
      onBlur={focusOut}
    >
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
      <ChartContainer
        config={config}
        overlay={
          <SnapTooltip
            hit={hit}
            items={visibleItems}
            kind={
              type === "pie"
                ? "slice"
                : type === "scatter"
                  ? "scatter"
                  : "category"
            }
            xKey={text(data.xKey)}
            valueKey={text(data.valueKey)}
            onHover={onHover}
          />
        }
        className="h-[248px] w-full"
        initialDimension={{ width: 640, height: 248 }}
      >
        {chart}
      </ChartContainer>
      <ChartLegend
        items={items}
        hidden={selection.hidden}
        hovered={active}
        select={select}
        highlight={setLegendHovered}
        interactive={
          (type === "bar" || type === "line" || type === "") && items.length > 1
        }
      />
    </div>
  );
}
