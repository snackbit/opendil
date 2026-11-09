// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  isLocalSvgValue,
  localStyleText,
  stripRemoteReferences,
} from "../../../packages/opendil/src/dil/svg-safety";
import { svgAttributes } from "../../../packages/opendil/src/dil/widgets/primitives/attribute-values";
import { sanitizeDiagram } from "../../../packages/opendil/src/dil/widgets/mermaid-diagram";

// Each loads a resource from outside the document when the SVG renders.
const REMOTE_VALUES = [
  "url(https://evil.example/p.svg#g)",
  "url('//evil.example/p.svg#g')",
  'url("evil.svg#g")',
  "url(data:image/svg+xml,x)",
  "URL(evil.svg#g)",
  "u\\72l(evil.svg#g)",
  'image-set("evil.png" 1x)',
  "-webkit-image-set(url(evil.png) 1x)",
  "cross-fade(url(a.png), url(b.png), 50%)",
  '@import "evil.css"',
  'src("evil.svg#g")',
  'image("evil.png")',
];

describe("inline SVG attributes", () => {
  it("drops links, styles, filters, masks and clip paths, which can fetch", () => {
    expect(
      svgAttributes({
        d: "M0 0L10 10",
        fill: "url(#paint)",
        stroke: "url( '#outline' )",
        filter: "url(#blur)",
        mask: "url(#cut)",
        clipPath: "url(#clip)",
        style: "fill:url(https://evil.example/x)",
        href: "https://evil.example/x.svg",
        "xlink:href": "https://evil.example/x.svg",
      }),
    ).toEqual({
      d: "M0 0L10 10",
      fill: "url(#paint)",
      stroke: "url( '#outline' )",
    });
  });
  it("refuses every remote reference in paint and marker values", () => {
    for (const value of REMOTE_VALUES) {
      expect(isLocalSvgValue(value)).toBe(false);
      expect(
        svgAttributes({ fill: value, stroke: value, markerEnd: value }),
      ).toEqual({});
    }
  });
  it("keeps plain values and fragment references", () => {
    for (const value of [
      "#156f55",
      "currentColor",
      "none",
      'url("#a-1")',
      "12",
    ])
      expect(isLocalSvgValue(value)).toBe(true);
  });
});

describe("diagram styles", () => {
  it("removes imports, web fonts, image sets and remote url() values", () => {
    const css = [
      '@import url("https://evil.example/a.css");',
      "@import 'b.css';",
      "@font-face{font-family:X;src:url(https://evil.example/x.woff2)}",
      "#d .node{fill:url(#local);stroke:#333}",
      "#d .edge{background:url(https://evil.example/e.png)}",
      '#d .label{background-image:image-set("evil.png" 1x)}',
      '#d .cluster{background-image:src("evil.png")}',
    ].join("");
    const local = localStyleText(css);
    expect(local).not.toMatch(/@import|@font-face|evil|image-set|src\(/);
    expect(local).toContain("fill:url(#local)");
    expect(local).toContain("stroke:#333");
  });
  it("drops CSS with escapes, which could spell a fetch these rules miss", () => {
    expect(localStyleText("a{background:u\\72l(evil.png)}")).toBe("");
  });
  it("strips link attributes and remote references from a rendered SVG tree", () => {
    // Built element by element: happy-dom's HTML parser reads <style> inside
    // SVG as raw text to the end of the markup.
    const svg = element("svg", { viewBox: "0 0 10 10" });
    const style = element("style", {});
    style.textContent =
      "@import 'x.css';.a{fill:url(https://evil.example/p)}.b{fill:url(#g)}";
    const rect = element("rect", {
      class: "a",
      fill: "url(https://evil.example/p#x)",
      filter: "url(evil.svg#f)",
      mask: "url(#m)",
      style: "clip-path:url(https://evil.example/c)",
    });
    const path = element("path", {
      d: "M0 0",
      fill: 'image("evil.png")',
      stroke: 'cross-fade("evil.png", "evil.png", 50%)',
    });
    const image = element("image", { href: "https://evil.example/i.png" });
    image.setAttributeNS(
      "http://www.w3.org/1999/xlink",
      "xlink:href",
      "https://evil.example/i.png",
    );
    const label = element("text", { onclick: "alert(1)" });
    label.textContent = "Label";
    svg.append(style, rect, path, image, label);
    stripRemoteReferences(svg);
    expect(svg.outerHTML).not.toMatch(/evil|@import|onclick|href/);
    expect(style.textContent).toContain(".b{fill:url(#g)}");
    expect(rect.getAttribute("mask")).toBe("url(#m)");
    expect(rect.getAttribute("style")).toBe("clip-path:none");
    expect(path.getAttribute("d")).toBe("M0 0");
    expect(label.textContent).toBe("Label");
  });
  it("leaves Mermaid output empty when sanitizing leaves no SVG", () => {
    // Under happy-dom DOMPurify drops the svg root; browsers keep it, and the
    // diagram e2e checks that a rendered diagram fetches nothing.
    expect(sanitizeDiagram("<p>not a diagram</p>")).toBe("");
  });
});
function element(name: string, attributes: Record<string, string>) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes))
    node.setAttribute(key, value);
  return node;
}
