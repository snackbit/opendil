import { expect, it } from "vitest";
import { svgAttributes } from "../../../packages/opendil/src/dil/widgets/primitives/attribute-values";

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
