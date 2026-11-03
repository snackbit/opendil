// @vitest-environment happy-dom
import {
  act,
  createElement,
  createContext,
  useContext,
  useState,
  StrictMode,
} from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { ShadowRenderer } from "../../../packages/opendil/src/dil/isolation/shadow-renderer";
import { installShadowStyles } from "../../../packages/opendil/src/dil/isolation/shadow-styles";
afterEach(() => vi.unstubAllGlobals());
it("preserves context, interaction and root identity when custom styles change", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("__DIL_STYLES__", ".dil-scope{color:black}");
  const Context = createContext("missing");
  function Child() {
    const [count, setCount] = useState(0);
    const label = useContext(Context);
    function click() {
      setCount((value) => value + 1);
    }
    return createElement("button", { onClick: click }, label + ":" + count);
  }
  const mount = document.createElement("div");
  document.body.append(mount);
  const root = createRoot(mount);
  const view = (css?: string) =>
    createElement(
      StrictMode,
      null,
      createElement(
        Context.Provider,
        { value: "Consumer" },
        createElement(ShadowRenderer, {
          shadowStyles: css,
          children: createElement(Child),
        }),
      ),
    );
  try {
    await act(() => root.render(view()));
    const shadow = mount.firstElementChild?.shadowRoot,
      button = shadow?.querySelector("button");
    expect(shadow).toBeDefined();
    expect(shadow?.adoptedStyleSheets).toHaveLength(1);
    const base = shadow?.adoptedStyleSheets[0];
    await act(() => button?.click());
    expect(button?.textContent).toBe("Consumer:1");
    await act(() => root.render(view("button{color:blue}")));
    expect(mount.firstElementChild?.shadowRoot).toBe(shadow);
    expect(shadow?.querySelector("button")).toBe(button);
    expect(shadow?.adoptedStyleSheets).toHaveLength(2);
    expect(shadow?.adoptedStyleSheets[0]).toBe(base);
    const other = document.createElement("div").attachShadow({ mode: "open" });
    installShadowStyles(other, "");
    expect(other.adoptedStyleSheets[0]).toBe(base);
  } finally {
    await act(() => root.unmount());
    mount.remove();
  }
});
it("renders an SSR-safe host and rejects sheets without a rendering document", () => {
  vi.stubGlobal("__DIL_STYLES__", "");
  expect(
    renderToStaticMarkup(createElement(ShadowRenderer, { children: "Child" })),
  ).toContain('data-dil-mode="shadow"');
  const detached = document.implementation.createHTMLDocument();
  vi.spyOn(detached, "defaultView", "get").mockReturnValue(null);
  const root = detached.createElement("div").attachShadow({ mode: "open" });
  expect(() => installShadowStyles(root, "")).toThrow("browser document");
});
