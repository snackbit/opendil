// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import {
  HighlightedCode,
  renderTokens,
} from "../../../packages/opendil/src/dil/widgets/code/highlighted-code";
import { CodeEditor } from "../../../packages/opendil/src/dil/widgets/code/code-editor";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each([
  ["typescript", "type Result<T> = { ok: true; data: T };"],
  ["TS", "const text: string = 'Hello';"],
  ["json", '{"count":42,"ok":true}'],
  ["html", '<script>alert("code is data")</script>'],
  ["python", "def greet():\n  return 'Hello'"],
])(
  "highlights %s while preserving authored text safely",
  (language, source) => {
    const html = renderToStaticMarkup(
      createElement(HighlightedCode, { language, source }),
    );
    const container = document.createElement("code");
    container.innerHTML = html;
    expect(container.textContent).toBe(source);
    expect(container.querySelector('[class^="hljs-"]')).not.toBeNull();
    expect(container.querySelector("script")).toBeNull();
  },
);
it("falls back to exact plain text for unknown languages and bounded highlighting workloads", () => {
  for (const [language, source] of [
    ["unknown", "<script>x</script>"],
    ["ts", "x".repeat(32769)],
    ["typescript", "const a = 42;\n".repeat(1000)],
  ] as const) {
    const html = renderToStaticMarkup(
      createElement(HighlightedCode, { language, source }),
    );
    const container = document.createElement("code");
    container.innerHTML = html;
    expect(container.textContent).toBe(source);
    expect(container.querySelector("span")).toBeNull();
  }
});
it("keeps one native editor while synchronizing the visible highlight during editing and scrolling", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let resize = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const mount = document.createElement("div");
  document.body.append(mount);
  const root = createRoot(mount),
    changed = vi.fn();
  try {
    await act(() =>
      root.render(
        createElement(CodeEditor, {
          source: "const x = 1;",
          language: "typescript",
          ready: true,
          wrapped: false,
          onChange: changed,
        }),
      ),
    );
    const editor = mount.querySelector("textarea"),
      layer = mount.querySelector("pre");
    if (!editor || !layer) throw new Error("Missing editor layers");
    editor.setSelectionRange(2, 5);
    editor.scrollLeft = 20;
    editor.scrollTop = 30;
    editor.dispatchEvent(new Event("scroll", { bubbles: true }));
    expect(layer.scrollLeft).toBe(20);
    expect(layer.scrollTop).toBe(30);
    await act(() =>
      root.render(
        createElement(CodeEditor, {
          source: "const updated = true;",
          language: "typescript",
          ready: true,
          wrapped: true,
          onChange: changed,
        }),
      ),
    );
    expect(mount.querySelector("textarea")).toBe(editor);
    expect(editor.getAttribute("wrap")).toBe("soft");
    expect(editor.value).toBe("const updated = true;");
    expect(layer.textContent).toBe("const updated = true;\n");
    resize();
    expect(layer.getAttribute("aria-hidden")).toBe("true");
    expect(editor.getAttribute("spellcheck")).toBe("false");
  } finally {
    await act(() => root.unmount());
    mount.remove();
  }
  expect(disconnect).toHaveBeenCalled();
  resize();
});
it("renders only text and spans from a HAST grammar result", () => {
  const content = renderTokens(
    {
      type: "root",
      children: [
        { type: "comment", value: "not source content" },
        {
          type: "element",
          tagName: "script",
          properties: {},
          children: [{ type: "text", value: "safe text" }],
        },
      ],
    },
    { value: 0 },
  );
  const html = renderToStaticMarkup(createElement("code", null, content));
  expect(html).toBe("<code><span>safe text</span></code>");
});
