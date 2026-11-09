import type { CSSProperties } from "react";
import { isLocalSvgValue } from "../../svg-safety";
export type Attributes = Readonly<Record<string, unknown>>;
export function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
export function number(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
}
export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return {};
  return Object.fromEntries(Object.entries(value));
}
export function invoke(attributes: Attributes, key: string, value?: unknown) {
  const action = attributes[key];
  if (typeof action === "function") return action(value);
}
const SVG_ATTRIBUTES = new Set([
  "viewBox",
  "width",
  "height",
  "x",
  "y",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "fill",
  "stroke",
  "strokeWidth",
  "fontSize",
  "fontWeight",
  "opacity",
  "id",
  "markerWidth",
  "markerHeight",
  "refX",
  "refY",
  "orient",
  "markerEnd",
]);
/**
 * Presentation-only SVG attributes. Links, `style`, filters, masks and clip
 * paths are not in the list, and paint and marker references stay in the
 * document, so inline SVG fetches nothing.
 */
export function svgAttributes(attributes: Attributes): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(attributes).filter(
      ([key, value]) =>
        SVG_ATTRIBUTES.has(key) &&
        (typeof value === "number" ||
          (typeof value === "string" && isLocalSvgValue(value))),
    ),
  );
}
const COLORS: Record<string, string> = {
  default: "var(--foreground)",
  primary: "var(--primary)",
  secondary: "var(--muted-foreground)",
  tertiary: "#96968e",
  success: "var(--dil-success)",
  warning: "var(--dil-warning)",
  danger: "var(--destructive)",
  "surface-secondary": "var(--secondary)",
  "surface-tertiary": "var(--muted)",
  subtle: "var(--border)",
  strong: "#73736d",
};
export function color(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (COLORS[value]) return COLORS[value];
  return value.length < 128 &&
    !/url|var\(|[;{}]/i.test(value) &&
    CSS.supports("color", value)
    ? value
    : undefined;
}
const RADII: Record<string, string> = {
  sm: "4px",
  md: "6px",
  lg: "8px",
  xl: "12px",
  "2xl": "16px",
  full: "9999px",
};
export function layoutStyle(
  attributes: Attributes,
): CSSProperties & { "--dil-columns"?: number } {
  const style: CSSProperties & { "--dil-columns"?: number } = {};
  const padding = attributes.padding;
  if (typeof padding === "number") style.padding = padding * 4;
  else if (padding) {
    const dimensions = record(padding);
    if (typeof dimensions.x === "number")
      style.paddingInline = dimensions.x * 4;
    if (typeof dimensions.y === "number") style.paddingBlock = dimensions.y * 4;
  }
  if (typeof attributes.gap === "number") style.gap = attributes.gap * 4;
  if (typeof attributes.radius === "string")
    style.borderRadius = RADII[attributes.radius] ?? attributes.radius;
  if (attributes.border) {
    const border = record(attributes.border);
    style.border = `${number(border.size, 1)}px solid ${color(border.color) ?? "var(--border)"}`;
  }
  style.backgroundColor = color(attributes.background);
  if (attributes.clip) style.overflow = "hidden";
  if (
    typeof attributes.width === "string" ||
    typeof attributes.width === "number"
  )
    style.width = attributes.width;
  if (
    typeof attributes.maxWidth === "string" ||
    typeof attributes.maxWidth === "number"
  )
    style.maxWidth = attributes.maxWidth;
  if (
    typeof attributes.height === "string" ||
    typeof attributes.height === "number"
  )
    style.height = attributes.height;
  if (
    typeof attributes.flex === "string" ||
    typeof attributes.flex === "number"
  )
    style.flex = attributes.flex;
  if (typeof attributes.columns === "number")
    style["--dil-columns"] = attributes.columns;
  if (attributes.align)
    style.alignItems = text(attributes.align)
      .replace("start", "flex-start")
      .replace("end", "flex-end");
  if (attributes.justify)
    style.justifyContent =
      { between: "space-between", end: "flex-end", start: "flex-start" }[
        text(attributes.justify)
      ] ?? text(attributes.justify);
  if (attributes.wrap === "wrap") style.flexWrap = "wrap";
  return style;
}
