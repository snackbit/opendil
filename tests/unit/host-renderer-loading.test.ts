// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const mounts = vi.hoisted(() => ({ count: 0 }));
// Stand-in for the lazily loaded host/Shadow DOM renderer chunk. Its state
// counts mounts: a remount would show a new number.
vi.mock("../../packages/opendil/src/dil/styled-renderer", () => ({
  StyledRenderer: function StyledRenderer({ text }: { text: string }) {
    const [mount] = useState(() => ++mounts.count);
    return createElement(
      "p",
      { "data-testid": "styled", "data-mount": mount },
      text,
    );
  },
}));

const { DilRenderer } =
  await import("../../packages/opendil/src/dil/dil-renderer");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("loading the host renderer on demand", () => {
  it("renders after the chunk loads and keeps rendering without React use() warnings", async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(DilRenderer, { mode: "host", text: "One" }));
    });
    expect(container.textContent).toBe("One");
    const first = container.querySelector("[data-testid=styled]");

    await act(async () => {
      root.render(createElement(DilRenderer, { mode: "host", text: "Two" }));
    });
    expect(container.textContent).toBe("Two");
    // The answer updates in place: arriving code does not remount it.
    expect(container.querySelector("[data-testid=styled]")).toBe(first);
    // The renderer kept its state across the load and the later renders.
    expect(first?.getAttribute("data-mount")).toBe("1");
    expect(mounts.count).toBe(1);

    act(() => root.unmount());
    expect(errors).not.toHaveBeenCalled();
  });
});
