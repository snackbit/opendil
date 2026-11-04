import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { svgAttributes } from "../../../packages/opendil/src/dil/widgets/primitives/attribute-values";
import { ChartContainer } from "../../../packages/opendil/src/components/ui/display/chart";

it("keeps SVG paint and marker references inside the document", () => {
  expect(
    svgAttributes({
      d: "M0 0L10 10",
      fill: "url(#gradient)",
      stroke: "#156f55",
      markerEnd: "url(#arrow)",
      strokeWidth: 2,
      onClick: "alert(1)",
      href: "#x",
      style: "fill:red",
    }),
  ).toEqual({
    d: "M0 0L10 10",
    fill: "url(#gradient)",
    stroke: "#156f55",
    markerEnd: "url(#arrow)",
    strokeWidth: 2,
  });
  for (const value of [
    "url(//evil.example/p.svg#g)",
    "url( https://evil.example/p.svg#g)",
    "URL(evil.svg#g)",
    "u\\72l(//evil.example/p.svg#g)",
    "url(data:image/svg+xml,x)",
    "red;background:red",
    "<script>",
  ])
    expect(svgAttributes({ fill: value, markerEnd: value })).toEqual({});
});

it("passes only plain chart series keys and colors to inline custom properties", () => {
  const markup = renderToStaticMarkup(
    createElement(ChartContainer, {
      id: "test",
      config: {
        revenue: { label: "Revenue", color: "var(--chart-1)" },
        "a:red} *{background:url(https://evil.example/x)} b{--c": {
          label: "Injected key",
          color: "var(--chart-2)",
        },
        cost: { label: "Injected color", color: "red} *{color:red" },
        leak: { label: "URL color", color: "url(evil)" },
        themed: { theme: { light: "#111111", dark: "rgb(1, 2, 3)" } },
        split: { theme: { light: "blue", dark: "url(evil)" } },
      },
      style: { minHeight: 10 },
      children: createElement("svg"),
    }),
  );
  // A <style> element would need style-src 'unsafe-inline' under a strict policy.
  expect(markup).not.toContain("<style");
  const style = /data-slot="chart"[^>]*style="([^"]*)"/.exec(markup)?.[1];
  expect(style).toBe(
    "--color-revenue:var(--chart-1);--color-themed:light-dark(#111111, rgb(1, 2, 3));min-height:10px",
  );
});
