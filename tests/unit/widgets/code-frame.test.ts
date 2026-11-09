// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeFrame } from "../../../packages/opendil/src/dil/widgets/code/code-frame";
import {
  RendererEnvironmentContext,
  type RendererEnvironment,
} from "../../../packages/opendil/src/dil/renderer-environment";

let mount: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mount = document.createElement("div");
  document.body.append(mount);
  root = createRoot(mount);
});
afterEach(async () => {
  await act(() => root.unmount());
  mount.remove();
  vi.unstubAllGlobals();
});
const button = (name: string) => {
  const found = mount.querySelector<HTMLButtonElement>(
    `button[aria-label="${name}"]`,
  );
  if (!found) throw new Error("Missing button " + name);
  return found;
};
const alert = () => mount.querySelector('[role="alert"]')?.textContent;
function show(
  props: Parameters<typeof CodeFrame>[0],
  environment: RendererEnvironment = {},
) {
  const frame: ReactNode = createElement(CodeFrame, props);
  return act(() =>
    root.render(
      createElement(
        RendererEnvironmentContext.Provider,
        { value: environment },
        frame,
      ),
    ),
  );
}

describe("CodeFrame", () => {
  it("toggles word wrap", async () => {
    await show({ source: "a", language: "txt", ready: true });
    const block = mount.querySelector(".dil-code-block");
    expect(block?.getAttribute("data-word-wrap")).toBe("false");
    await act(() => button("Word wrap").click());
    expect(button("Word wrap").getAttribute("aria-pressed")).toBe("true");
    expect(block?.getAttribute("data-word-wrap")).toBe("true");
  });
  it("copies through the renderer's broker and reports a rejected copy", async () => {
    const copy = vi.fn(() => Promise.reject(new Error("bridge closed")));
    await show({ source: "npm test", language: "sh", ready: true }, { copy });
    await act(() => button("Copy code").click());
    expect(copy).toHaveBeenCalledWith("npm test");
    expect(alert()).toBe("Could not copy code. Check clipboard permissions.");
  });
  it("refuses to copy past the clipboard limit without calling the clipboard", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await show({ source: "x".repeat(65537), language: "", ready: true });
    await act(() => button("Copy code").click());
    expect(writeText).not.toHaveBeenCalled();
    // The notice names the length, not clipboard permissions.
    expect(alert()).toBe(
      "Code is longer than 65,536 characters, too long to copy.",
    );
    expect(button("Copy code").disabled).toBe(false);
  });
  it("forgets a copy outcome once the code changes", async () => {
    const copy = vi.fn(() => Promise.resolve(true));
    const props = { language: "js", ready: true, onChange: () => {} };
    await show({ ...props, source: "let a;" }, { copy });
    await act(() => button("Copy code").click());
    expect(mount.querySelector('[role="status"]')?.textContent).toBe(
      "Code copied.",
    );
    // An editable frame shows the editor; an edit is new, uncopied text.
    expect(mount.querySelector("textarea")?.value).toBe("let a;");
    await show({ ...props, source: "let b;" }, { copy });
    expect(mount.querySelector('[role="status"]')?.textContent).toBe("");
  });
});
