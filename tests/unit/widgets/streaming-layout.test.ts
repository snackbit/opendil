// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DilParser } from "../../../packages/opendil/src/dil/parser/dil-parser";
import { DilDocument } from "../../../packages/opendil/src/dil/runtime/document";
import { NodeView } from "../../../packages/opendil/src/dil/view/node-view";
import { LoadingBlock } from "../../../packages/opendil/src/dil/view/loading-block";
import { RenderAllowance } from "../../../packages/opendil/src/dil/view/render-limit";
import { RenderBoundary } from "../../../packages/opendil/src/dil/view/render-boundary";
import { renderToStaticMarkup } from "react-dom/server";
// Only transport timing is controlled here; real QuickJS is exercised by runtime and browser suites.
let holding = false;
class Transport {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  postMessage(message: {
    id: number;
    type: string;
    source?: string;
    scope?: Record<string, unknown>;
  }) {
    if (message.source === "later" && holding) return;
    const entry = message.scope?.entry;
    const value =
      message.source === "flag"
        ? true
        : message.source === "list"
          ? [
              { id: "one", label: "One" },
              { id: "two", label: "Two" },
            ]
          : message.source === "entry.label" &&
              entry &&
              typeof entry === "object" &&
              "label" in entry
            ? entry.label
            : "First";
    queueMicrotask(() =>
      this.onmessage?.({
        data: {
          id: message.id,
          value,
          ...(message.source === "bad" ? { error: "Missing binding" } : {}),
          ...(message.type === "declare" ? { changed: true, revision: 1 } : {}),
        },
      }),
    );
  }
  terminate() {}
}
beforeEach(() => {
  holding = false;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("__DIL_VM_WORKER__", "");
  vi.stubGlobal("Worker", Transport);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("streams into the real control shell without scaffolds or replacement on readiness", async () => {
  const model = new DilDocument(),
    parser = new DilParser();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() => {
      model.apply(parser.append('<box border padding="4"><button ', false));
      root.render(createElement(NodeView, { id: 0, document: model }));
    });
    expect(container.querySelector('[aria-label^="Loading"]')).toBeNull();
    await act(() =>
      model.apply(parser.append('variant="outline">Action ', false)),
    );
    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(true);
    await act(() => model.apply(parser.append("</button></box>", true)));
    expect(container.querySelector("button")).toBe(button);
    expect(button?.disabled).toBe(false);
    expect(button?.textContent).toContain("Action");
    expect(container.querySelector('[aria-label^="Loading"]')).toBeNull();
  } finally {
    await act(() => root.unmount());
    model.engine.dispose();
    container.remove();
  }
});
it.each([
  ["# Heading\n\nParagraph", "Heading"],
  ["<svg><text>Vector</text></svg>", "Vector"],
  ["{#if flag}<text>Yes</text>{:else}<text>No</text>{/if}", "Yes"],
  ["{#each list as entry,i}<text>{entry.label}</text>{/each}", "OneTwo"],
  ["<text title={bad}>Hidden</text>", "Missing binding"],
  ["</wrong>", "Unexpected closing tag"],
])(
  "presents ready content and local errors through the real parser: %s",
  async (source, expected) => {
    const model = new DilDocument(),
      parser = new DilParser();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(() => {
        model.apply(parser.append(source, true));
        root.render(createElement(NodeView, { id: 0, document: model }));
      });
      expect(container.textContent).toContain(expected);
      expect(container.querySelector(".dil-skeleton")).toBeNull();
    } finally {
      await act(() => root.unmount());
      model.engine.dispose();
      container.remove();
    }
  },
);
it("preserves prior evaluated content during refresh and ignores pending syntax in flow counts", async () => {
  const model = new DilDocument(),
    parser = new DilParser();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() => {
      model.apply(parser.append("<box> <input value={later}/>\n", false));
      root.render(createElement(NodeView, { id: 0, document: model }));
    });
    const input = container.querySelector("input");
    expect(input?.value).toBe("First");
    holding = true;
    await act(() => model.engine.declare("const refreshed=1"));
    expect(container.querySelector("input")).toBe(input);
    expect(input?.value).toBe("First");
    const parent = [...model.nodes.values()].find(
      (state) => state.node.name === "box",
    )?.node.id;
    if (parent === undefined) throw new Error("Missing box");
    const flow = model.flowChildren(parent);
    expect(flow.getState().length).toBe(1);
    await act(() => model.apply(parser.append("<button ", false)));
    expect(flow.getState().length).toBe(1);
    await act(() => model.apply(parser.append(">Later</button></box>", true)));
    expect(flow.getState().length).toBe(2);
    await act(() => model.engine.halt("Stopped deliberately"));
  } finally {
    await act(() => root.unmount());
    model.engine.dispose();
    container.remove();
  }
});
it("uses local table/SVG errors and rejects an oversized subtree without scaffolds", async () => {
  expect(
    renderToStaticMarkup(createElement(LoadingBlock, { svg: true })),
  ).toContain("data-dil-pending");
  for (const table of [false, "body", "row"] as const) {
    const html = renderToStaticMarkup(
      createElement(LoadingBlock, { table, error: "Invalid content" }),
    );
    expect(html).toContain("Invalid content");
  }
  expect(
    renderToStaticMarkup(
      createElement(LoadingBlock, { svg: true, error: "Invalid SVG" }),
    ),
  ).toContain("Invalid SVG");
  const model = new DilDocument(),
    parser = new DilParser();
  const container = document.createElement("div"),
    root = createRoot(container);
  try {
    await act(() => {
      model.apply(
        parser.append("<box><text>One</text><text>Two</text></box>", true),
      );
      root.render(
        createElement(
          RenderAllowance.Provider,
          { value: 2 },
          createElement(NodeView, { id: 0, document: model }),
        ),
      );
    });
    expect(model.status.getState().error).toContain("display limit");
  } finally {
    await act(() => root.unmount());
    model.engine.dispose();
  }
});
it("keeps genuine render failures scoped and retries only after a changed revision", async () => {
  const container = document.createElement("div"),
    root = createRoot(container);
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  function Broken(): never {
    throw "Component failed";
  }
  try {
    await act(() =>
      root.render(
        createElement(RenderBoundary, {
          revision: "one",
          streaming: false,
          children: createElement(Broken),
        }),
      ),
    );
    expect(container.textContent).toContain("Cannot render this component");
    await act(() =>
      root.render(
        createElement(RenderBoundary, {
          revision: "two",
          streaming: true,
          children: createElement(Broken),
        }),
      ),
    );
    expect(container.textContent).toBe("");
    await act(() =>
      root.render(
        createElement(RenderBoundary, {
          revision: "three",
          streaming: false,
          children: "Recovered",
        }),
      ),
    );
    expect(container.textContent).toBe("Recovered");
  } finally {
    await act(() => root.unmount());
    consoleError.mockRestore();
  }
});
