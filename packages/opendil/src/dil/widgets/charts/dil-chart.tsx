"use client";
import { useCallback, useState, useMemo, type FocusEvent } from "react";
import {
  BarChart,
  CartesianGrid,
  Cell,
  LineChart,
  Pie,
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
import { ChartSeries } from "./chart-series";
import { SnapCursor, type ChartHit } from "./snap-cursor";
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
    setHovered(next?.point.item.id ?? null);
  }, []);
  const visibleItems = useMemo(
    () => items.filter((item) => !selection.hidden.has(item.id)),
    [items, selection.hidden],
  );
  const active =
    hovered !== null && ids.includes(hovered) && !selection.hidden.has(hovered)
      ? hovered
      : null;
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
  const clear = useCallback(() => {
    setHovered(null);
    setHit(null);
  }, []);
  const sliceEnter = useCallback((event: FocusEvent<SVGElement>) => {
    setHovered(event.currentTarget.getAttribute("data-series-id"));
  }, []);
  const pieEnter = useCallback(
    (_entry: unknown, index: number) => {
      const ids: string[] = JSON.parse(identity);
      setHovered(ids.filter((id) => !selection.hidden.has(id))[index] ?? null);
    },
    [identity, selection.hidden],
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
    />
  ));
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
      <ChartTooltip
        content={<ChartTooltipContent />}
        {...(hit ? { active: false, cursor: false } : {})}
      />
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
  if (type === "pie") {
    const visible = rows.flatMap((row, index) => {
      const item = items[index];
      return item && !selection.hidden.has(item.id) ? [{ row, item }] : [];
    });
    chart = (
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent />} />
        <Pie
          data={visible.map((entry) => entry.row)}
          dataKey={text(data.valueKey)}
          nameKey={text(data.nameKey)}
          innerRadius="48%"
          outerRadius="78%"
          isAnimationActive={false}
          onMouseEnter={pieEnter}
          onMouseLeave={clear}
        >
          {visible.map(({ item }) => (
            <Cell
              key={item.id}
              fill={item.color}
              opacity={active !== null && active !== item.id ? 0.625 : 1}
              className="dil-chart-series"
              data-series-id={item.id}
              tabIndex={0}
              onFocus={sliceEnter}
              onBlur={clear}
            />
          ))}
        </Pie>
      </PieChart>
    );
  } else if (type === "bar")
    chart = (
      <BarChart data={rows}>
        {axes}
        {marks}
        {cursor}
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
    >
      <ChartContainer
        config={config}
        overlay={
          type !== "pie" ? (
            <SnapTooltip
              hit={hit}
              items={visibleItems}
              xKey={text(data.xKey)}
              scatter={type === "scatter"}
              onHover={onHover}
            />
          ) : null
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
        highlight={highlight}
        interactive={
          (type === "bar" || type === "line" || type === "") && items.length > 1
        }
      />
    </div>
  );
}
