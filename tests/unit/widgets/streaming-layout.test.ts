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
import type { DilRenderError } from "../../../packages/opendil/src/dil/render-error";
// Only transport timing is controlled here; real QuickJS is exercised by runtime and browser suites.
let holding = false;
interface Evaluation {
  key: string;
  source?: string;
  scope?: Record<string, unknown>;
}
function evaluate({ key, source, scope }: Evaluation) {
  const entry = scope?.entry;
  const value =
    source === "flag"
      ? true
      : source === "list"
        ? [
            { id: "one", label: "One" },
            { id: "two", label: "Two" },
          ]
        : source === "entry.label" &&
            entry &&
            typeof entry === "object" &&
            "label" in entry
          ? entry.label
          : "First";
  return {
    key,
    value,
    ...(source === "bad" ? { error: "Missing binding" } : {}),
  };
}
class Transport {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  postMessage(message: {
    id: number;
    type: string;
    steps?: Array<{ type: string }>;
    evaluations?: Evaluation[];
  }) {
    const evaluations = message.evaluations ?? [];
    if (holding && evaluations.some(({ source }) => source === "later")) return;
    queueMicrotask(() =>
      this.onmessage?.({
        data: {
          id: message.id,
          steps: (message.steps ?? []).map((step) =>
            step.type === "declare" ? { changed: true, revision: 1 } : {},
          ),
          results: evaluations.map(evaluate),
          revision: 1,
        },
      }),
    );
  }
  terminate() {}
}
/** Results publish with the next frame, or its timer fallback. */
const nextFrame = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 60)));
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
  [
    "<text title={bad}>Hidden</text>",
    "This part of the response couldn't be shown.",
  ],
  ["</Wrong>", "This part of the response couldn't be shown."],
  ["<box><text>Kept</text><text>Cut", "KeptCut"],
  [
    "Pass `{ leading: false }` to `debounce`.",
    "Pass { leading: false } to debounce.",
  ],
  [
    "Wrap the chart in a `<div>` if it overflows.\n\nThen measure it.",
    "Wrap the chart in a <div> if it overflows.Then measure it.",
  ],
  [
    "Wrap it in a <div> if it overflows.",
    "Wrap it in a <div> if it overflows.",
  ],
  ["<div>\nBlock prose\n</div>", "<div>\nBlock prose\n</div>"],
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
      await nextFrame();
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
    await nextFrame();
    const input = container.querySelector("input");
    expect(input?.value).toBe("First");
    holding = true;
    await act(() => model.engine.declare("const refreshed=1"));
    await nextFrame();
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
    expect(model.status.getState().error?.message).toContain("display limit");
  } finally {
    await act(() => root.unmount());
    model.engine.dispose();
  }
});
it("keeps genuine render failures scoped and retries only after a changed revision", async () => {
  const container = document.createElement("div"),
    root = createRoot(container);
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const onError = vi.fn();
  function Broken(): never {
    throw "Component failed";
  }
  try {
    await act(() =>
      root.render(
        createElement(RenderBoundary, {
          revision: "one",
          streaming: false,
          onError,
          children: createElement(Broken),
        }),
      ),
    );
    expect(container.textContent).toContain("Cannot render this component");
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      "Cannot render this component",
    );
    await act(() =>
      root.render(
        createElement(RenderBoundary, {
          revision: "two",
          streaming: true,
          onError,
          children: createElement(Broken),
        }),
      ),
    );
    expect(container.textContent).toBe("");
    // A failure while streaming can still resolve, so it is not reported.
    expect(onError).toHaveBeenCalledOnce();
    await act(() =>
      root.render(
        createElement(RenderBoundary, {
          revision: "three",
          streaming: false,
          onError,
          children: "Recovered",
        }),
      ),
    );
    expect(container.textContent).toBe("Recovered");
    expect(onError).toHaveBeenCalledOnce();
  } finally {
    await act(() => root.unmount());
    consoleError.mockRestore();
  }
});
it("reports each problem readers see to onError and the console once the message is final", async () => {
  const model = new DilDocument(),
    parser = new DilParser();
  const reported: DilRenderError[] = [];
  model.onError = (error) => reported.push(error);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const source =
    "Seats: {bad}\n\n<text title={bad}>Hidden</text><Foo>Custom</Foo>";
  try {
    await act(() => {
      model.apply(parser.append(source));
      root.render(createElement(NodeView, { id: 0, document: model }));
    });
    await nextFrame();
    // Later source could still define a binding, so nothing is reported yet.
    expect(container.textContent).toContain("Cannot evaluate this value.");
    expect(reported).toEqual([]);
    await act(() => model.apply(parser.append("", true)));
    const text = source.indexOf("<text");
    const custom = source.indexOf("<Foo");
    expect(reported).toHaveLength(3);
    expect(reported).toEqual(
      expect.arrayContaining([
        {
          kind: "runtime",
          code: "expression-failed",
          message: "Cannot evaluate {bad}: Missing binding",
          offset: 0,
        },
        {
          kind: "runtime",
          code: "attributes-failed",
          message: "Cannot evaluate the attributes of <text>: Missing binding",
          offset: text,
        },
        {
          kind: "syntax",
          code: "unknown-component",
          message:
            "<Foo> is neither a stock DIL component nor one passed in the components prop.",
          offset: custom,
        },
      ]),
    );
    expect(warn).toHaveBeenCalledWith(
      `OpenDIL: Cannot evaluate {bad}: Missing binding (at character 0 of the message source)`,
    );
    expect(warn).toHaveBeenCalledTimes(3);
    // Readers see generic wording instead of developer details.
    const alerts = [...container.querySelectorAll('[role="alert"]')].map(
      (alert) => alert.textContent,
    );
    expect(alerts).toEqual([
      "Cannot evaluate this value.",
      "This part of the response couldn't be shown.",
      "This part of the response couldn't be shown.",
    ]);
    expect(container.textContent).not.toContain("Foo");
    // Re-rendering the final message reports nothing again.
    await act(() =>
      root.render(createElement(NodeView, { id: 0, document: model })),
    );
    expect(reported).toHaveLength(3);
  } finally {
    await act(() => root.unmount());
    model.engine.dispose();
    container.remove();
  }
});
