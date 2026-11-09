// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CodeEditor,
  EDITOR_METRICS,
} from "../../../packages/opendil/src/dil/widgets/code/code-editor";

let mount: HTMLDivElement;
let root: Root;
let hostStyles: HTMLStyleElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // A host page's own textarea rules, as a CSS reset or base layer writes them.
  hostStyles = document.createElement("style");
  hostStyles.textContent =
    "textarea{font-size:20px;line-height:31px;letter-spacing:1px;padding:7px 9px;tab-size:8;font-family:serif}";
  document.head.append(hostStyles);
  mount = document.createElement("div");
  document.body.append(mount);
  root = createRoot(mount);
});
afterEach(async () => {
  await act(() => root.unmount());
  mount.remove();
  hostStyles.remove();
  vi.unstubAllGlobals();
});
function show(source: string, wrapped = false) {
  return act(() =>
    root.render(
      createElement(CodeEditor, {
        source,
        language: "ts",
        ready: true,
        wrapped,
        onChange: () => {},
      }),
    ),
  );
}
const layers = () => {
  const input = mount.querySelector("textarea"),
    highlight = mount.querySelector<HTMLElement>(".dil-code-highlight");
  if (!input || !highlight) throw new Error("Missing editor layers");
  return { input, highlight };
};

describe("CodeEditor", () => {
  it("gives the highlight layer the textarea's computed text metrics", async () => {
    await show("const a = 1;\n\tconst b = 2;");
    const { input, highlight } = layers();
    const computed = getComputedStyle(input);
    expect(computed.fontSize).toBe("20px");
    for (const property of EDITOR_METRICS)
      expect(highlight.style.getPropertyValue(property)).toBe(
        computed.getPropertyValue(property),
      );
  });
  it("uses no utility classes that a host stylesheet could also define", async () => {
    await show("x");
    expect(layers().input.className).toBe("dil-code-input");
  });
  it("sizes the editor to its code and keeps the highlight over it", async () => {
    const scrollHeight = vi
      .spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get")
      .mockReturnValue(64);
    await show("a\nb\nc");
    const { input, highlight } = layers();
    expect(input.style.height).toBe(
      64 + input.offsetHeight - input.clientHeight + "px",
    );
    expect(highlight.style.height).toBe(input.offsetHeight + "px");
    expect(input.getAttribute("rows")).toBe("1");
    scrollHeight.mockRestore();
  });
  it("moves the highlight with the textarea's scroll", async () => {
    await show("a very long line ".repeat(40));
    const { input, highlight } = layers();
    input.scrollLeft = 120;
    await act(() => input.dispatchEvent(new Event("scroll")));
    expect(highlight.scrollLeft).toBe(input.scrollLeft);
  });
  it("lays the editor out again when its width changes, as wrapped code rewraps", async () => {
    const observed: (() => void)[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          observed.push(callback);
        }
        observe() {}
        disconnect() {}
      },
    );
    let width = 300;
    const offsetWidth = vi
      .spyOn(HTMLTextAreaElement.prototype, "offsetWidth", "get")
      .mockImplementation(() => width);
    await show("a b c", true);
    const { highlight } = layers();
    expect(highlight.style.width).toBe("300px");
    observed.forEach((callback) => callback());
    expect(highlight.style.width).toBe("300px");
    width = 180;
    observed.forEach((callback) => callback());
    expect(highlight.style.width).toBe("180px");
    offsetWidth.mockRestore();
  });
});
