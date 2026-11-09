import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoadingBlock } from "../../../packages/opendil/src/dil/view/loading-block";

const markup = (props: Parameters<typeof LoadingBlock>[0]) =>
  renderToStaticMarkup(createElement(LoadingBlock, props));

describe("pending widgets", () => {
  it.each([
    ["NodeGraph", 320],
    ["Chart", 280],
    ["Mermaid", 120],
  ])("hold the height a pending %s needs", (name, height) => {
    expect(markup({ name })).toBe(
      `<div aria-hidden="true" data-dil-pending="true" data-dil-pending-name="${name}" style="min-height:${height}px"></div>`,
    );
  });
  it("hold no space for parts without a known size, in tables, or in SVG", () => {
    expect(markup({ name: "text" })).toBe(
      '<template data-dil-pending="true"></template>',
    );
    expect(markup({})).toBe('<template data-dil-pending="true"></template>');
    expect(markup({ name: "Chart", table: "row" })).toBe(
      '<template data-dil-pending="true"></template>',
    );
    expect(markup({ name: "Chart", svg: true })).toBe(
      '<g data-dil-pending="true"></g>',
    );
  });
});
