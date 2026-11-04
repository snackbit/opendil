"use client";
import { useCallback, useState, useMemo, type FocusEvent } from "react";
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
const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
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
  const axes = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis
        dataKey={text(data.xKey)}
        type={type === "scatter" ? "number" : "category"}
        tickLine={false}
        axisLine={false}
      />
      <YAxis
        {...(type === "scatter"
          ? { dataKey: text(series[0]?.dataKey), type: "number" as const }
          : {})}
        tickLine={false}
        axisLine={false}
        width={45}
      />
      {stockTooltip}
    </>
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
      ref={presentationRef}
      role="group"
      aria-label={type + " chart"}
      data-chart-type={type}
      data-points={rows.length}
      onFocus={focusIn}
      onBlur={focusOut}
    >
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
