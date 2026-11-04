// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

// Stand-in for the lazily loaded host/Shadow DOM renderer chunk.
vi.mock("../../packages/opendil/src/dil/styled-renderer", () => ({
  StyledRenderer: ({ text }: { text: string }) =>
    createElement("p", { "data-testid": "styled" }, text),
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

    await act(async () => {
      root.render(createElement(DilRenderer, { mode: "host", text: "Two" }));
    });
    expect(container.textContent).toBe("Two");

    act(() => root.unmount());
    expect(errors).not.toHaveBeenCalled();
  });
});
