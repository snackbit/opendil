// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MarkdownRenderer } from "../../packages/opendil/src/entries/markdown";
import {
  clearRenderCaches,
  RenderCache,
} from "../../packages/opendil/src/dil/widgets/render-cache";
import { clearDocumentCache } from "../../packages/opendil/src/dil/document-cache";

// happy-dom cannot lay out a diagram; the stub stands in for Mermaid's renderer.
const mermaidRender = vi.hoisted(() =>
  vi.fn((id: string, _source: string) =>
    Promise.resolve({
      svg: `<svg><g data-drawn="true" id="${id}-arrow"></g></svg>`,
    }),
  ),
);
vi.mock("mermaid", () => ({
  default: { initialize: () => {}, render: mermaidRender },
}));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  clearRenderCaches();
  mermaidRender.mockClear();
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("keeps the most recently used entries within its count and size limits", () => {
  const cache = new RenderCache<number>(2, 10);
  cache.set("a", 1, 4);
  cache.set("b", 2, 4);
  expect(cache.get("a")).toBe(1);
  // Over the count: the least recently used entry goes.
  cache.set("c", 3, 1);
  expect(cache.get("b")).toBeUndefined();
  expect(cache.get("a")).toBe(1);
  // Over the size: entries go until the rest fit.
  cache.set("c", 3, 7);
  expect(cache.get("a")).toBeUndefined();
  expect(cache.get("c")).toBe(3);
  // An entry larger than the whole budget is not kept and evicts nothing.
  cache.set("d", 4, 11);
  expect(cache.get("d")).toBeUndefined();
  expect(cache.get("c")).toBe(3);
  clearRenderCaches();
  expect(cache.get("c")).toBeUndefined();
});

const urlTransform = vi.fn((url: string) => url);
const link = ({ href, children }: { href: string; children?: unknown }) =>
  createElement("a", { href }, children as never);
async function show(text: string | null, isStreaming = false) {
  await act(() =>
    root.render(
      text === null
        ? null
        : createElement(MarkdownRenderer, {
            text,
            isStreaming,
            markdownComponents: { link, urlTransform },
          }),
    ),
  );
}
it("renders a finished block once for every renderer that shows it", async () => {
  const text = "See [the docs](https://example.com/docs).";
  urlTransform.mockClear();
  await show(text);
  expect(host.querySelector("a")?.getAttribute("href")).toBe(
    "https://example.com/docs",
  );
  const parsed = urlTransform.mock.calls.length;
  expect(parsed).toBeGreaterThan(0);
  await show(null);
  await show(text);
  expect(host.querySelector("a")?.textContent).toBe("the docs");
  expect(urlTransform).toHaveBeenCalledTimes(parsed);
  // A session's end forgets rendered content with its documents.
  await show(null);
  clearDocumentCache();
  await show(text);
  expect(urlTransform.mock.calls.length).toBeGreaterThan(parsed);
});

it("does not keep a block that is still streaming", async () => {
  urlTransform.mockClear();
  await show("Read [this](https://example.com/a", true);
  await show(null);
  const first = urlTransform.mock.calls.length;
  await show("Read [this](https://example.com/a) now", true);
  expect(urlTransform.mock.calls.length).toBeGreaterThan(first);
});

// happy-dom's sanitizer keeps the drawing without its svg element.
const diagram = () =>
  host.querySelector("[aria-label='Mermaid diagram'] [data-drawn]");
it("lays a diagram out once and gives each instance its own id", async () => {
  const text = "```mermaid\ngraph TD; A-->B\n```";
  await show(text);
  await vi.waitFor(() => expect(diagram()).not.toBeNull());
  const firstId = diagram()?.id;
  expect(mermaidRender).toHaveBeenCalledTimes(1);
  await show(null);
  await show(`Again:\n\n${text}`);
  // Known source: the diagram is in the first commit, without a placeholder.
  expect(host.querySelector("[data-dil-pending]")).toBeNull();
  expect(diagram()?.id).toMatch(/^dil\w+-arrow$/);
  expect(diagram()?.id).not.toBe(firstId);
  expect(mermaidRender).toHaveBeenCalledTimes(1);
});
