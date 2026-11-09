// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DilParser } from "../../../packages/opendil/src/dil/parser/dil-parser";
import { DilDocument } from "../../../packages/opendil/src/dil/runtime/document";
import { RepeatedNodes } from "../../../packages/opendil/src/dil/view/repeated-nodes";
import { NodeChildren } from "../../../packages/opendil/src/dil/view/node-children";
import { RenderAllowance } from "../../../packages/opendil/src/dil/view/render-limit";
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("__DIL_VM_WORKER__", "");
  vi.stubGlobal(
    "Worker",
    class {
      postMessage() {}
      terminate() {}
    },
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each([
  {
    name: "positional and numeric keys",
    items: [{ id: 100 }, {}, { id: true }, null, 3],
    ready: true,
    svg: false,
    quota: 2000,
    rows: 5,
  },
  {
    name: "non-array data",
    items: "not a collection",
    ready: true,
    svg: false,
    quota: 2000,
    rows: 0,
  },
  {
    name: "incomplete templates",
    items: [1, 2],
    ready: false,
    svg: false,
    quota: 2000,
    rows: 0,
  },
  {
    name: "virtualized collections",
    items: Array.from({ length: 101 }, (_, id) => ({ id })),
    ready: true,
    svg: false,
    quota: 2000,
    rows: -1,
  },
  {
    name: "bounded vector repeats",
    items: Array.from({ length: 101 }, (_, id) => ({ id })),
    ready: true,
    svg: true,
    quota: 2000,
    rows: 101,
  },
  {
    name: "vector expansion limit",
    items: Array.from({ length: 1001 }, (_, id) => ({ id })),
    ready: true,
    svg: true,
    quota: 2000,
    rows: 0,
  },
  {
    name: "insufficient allowance",
    items: [1, 2],
    ready: true,
    svg: false,
    quota: 0,
    rows: 0,
  },
])(
  "handles $name without guessed scaffolds",
  async ({ items, ready, svg, quota, rows }) => {
    const model = new DilDocument(),
      parser = new DilParser();
    model.apply(
      parser.append(
        "{#each list as entry}<text>Row</text>" + (ready ? "{/each}" : " "),
        ready,
      ),
    );
    const state = [...model.nodes.values()].find(
      (state) => state.node.kind === "each",
    );
    if (!state) throw new Error("Missing repeat");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      const repeated = createElement(RepeatedNodes, {
        node: state.node,
        childrenIds: state.children,
        document: model,
        scope: {},
        instance: "",
        svg,
        attributes: { items },
      });
      await act(() =>
        root.render(
          createElement(
            RenderAllowance.Provider,
            { value: quota },
            svg ? createElement("svg", null, repeated) : repeated,
          ),
        ),
      );
      expect(container.querySelector(".dil-skeleton")).toBeNull();
      if (rows === -1) {
        expect(
          container.querySelector('[data-virtualized="true"]'),
        ).not.toBeNull();
        expect(
          container.querySelectorAll("[data-virtual-index]").length,
        ).toBeLessThan(101);
      } else
        expect(container.textContent?.match(/Row/g)?.length ?? 0).toBe(rows);
      if (quota === 0 || (svg && Array.isArray(items) && items.length > 1000))
        expect(model.status.getState().error?.message).toContain(
          "display limit",
        );
      await act(() => model.reportRenderLimit());
      await act(() => root.render(repeated));
      expect(container.textContent).toBe("");
    } finally {
      await act(() => root.unmount());
      model.engine.dispose();
      container.remove();
    }
  },
);
it("rejects a sibling subtree before expanding beyond its allowance", async () => {
  const model = new DilDocument(),
    parser = new DilParser();
  model.apply(parser.append("<text>One</text><text>Two</text>", true));
  const state = model.node(0).getState();
  const mount = document.createElement("div"),
    root = createRoot(mount);
  try {
    await act(() =>
      root.render(
        createElement(
          RenderAllowance.Provider,
          { value: 1 },
          createElement(NodeChildren, {
            childrenIds: state.children,
            document: model,
            scope: {},
            instance: "",
            inline: false,
            svg: false,
          }),
        ),
      ),
    );
    expect(model.status.getState().error?.message).toContain("display limit");
    expect(mount.textContent).toBe("");
  } finally {
    await act(() => root.unmount());
    model.engine.dispose();
  }
});
