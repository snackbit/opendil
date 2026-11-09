import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { describe, expect, it, vi } from "vitest";
import {
  DilRenderer,
  preloadHostRenderer,
} from "../../packages/opendil/src/dil/dil-renderer";
import {
  CustomizationContext,
  type DilComponentProps,
} from "../../packages/opendil/src/dil/customization";
import { CustomComponent } from "../../packages/opendil/src/dil/custom-component";
import { DilParser } from "../../packages/opendil/src/dil/parser/dil-parser";
import { DilDocument } from "../../packages/opendil/src/dil/runtime/document";
import { NodeView } from "../../packages/opendil/src/dil/view/node-view";
import { installInlineWorkers } from "../../packages/opendil/src/testing";

/** Server output once lazily loaded host and shadow renderers have resolved. */
async function renderComplete(element: ReactNode) {
  const { prelude } = await prerender(element);
  return new Response(prelude).text();
}

describe("public renderer configuration", () => {
  it("accepts explicitly chosen shadow styling without changing the iframe default", async () => {
    const html = await renderComplete(
      createElement(DilRenderer, {
        mode: "shadow",
        text: "",
        shadowStyles: ".consumer{color:blue}",
        className: "consumer",
      }),
    );
    expect(html).toContain('data-dil-mode="shadow"');
    expect(html).not.toContain("<iframe");
  });
  it("server-renders the lazily loaded host renderer", async () => {
    const element = createElement(DilRenderer, { mode: "host", text: "# A" });
    expect(await renderComplete(element)).toContain('data-dil-mode="host"');
    expect(() => renderToStaticMarkup(element)).not.toThrow();
  });
  it("renders host and shadow modes synchronously once preloaded", async () => {
    await preloadHostRenderer();
    expect(
      renderToStaticMarkup(
        createElement(DilRenderer, { mode: "host", text: "# A" }),
      ),
    ).toContain('data-dil-mode="host"');
    expect(
      renderToStaticMarkup(
        createElement(DilRenderer, {
          mode: "shadow",
          text: "# A",
          runtimeBaseUrl: "/ignored/",
        }),
      ),
    ).toContain('data-dil-mode="shadow"');
  });
  it("server-renders the content of text that is complete at mount", async () => {
    await preloadHostRenderer();
    const complete = renderToStaticMarkup(
      createElement(DilRenderer, {
        mode: "host",
        text: '# Heading\n\n<box><text>{"Literal"}</text></box>',
      }),
    );
    expect(complete).toContain("<h1>Heading</h1>");
    expect(complete).toContain("Literal");
    expect(complete).toContain('data-complete="true"');
    // A stream is parsed in the worker after mount, so the server sends none of it.
    const streaming = renderToStaticMarkup(
      createElement(DilRenderer, {
        mode: "host",
        text: "# Heading",
        isStreaming: true,
      }),
    );
    expect(streaming).not.toContain("Heading");
  });
  it("leaves text over the first-render limit to the parser worker", async () => {
    await preloadHostRenderer();
    const html = renderToStaticMarkup(
      createElement(DilRenderer, {
        mode: "host",
        text: "x".repeat(1_048_577),
      }),
    );
    expect(html).not.toContain("xxxx");
  });
  it.each([true, false])(
    "invokes only ready callback attributes (ready=%s)",
    (ready) => {
      const values: unknown[] = [];
      let invoke: DilComponentProps["invoke"] = () => {
        throw new Error("Component did not mount");
      };
      function Component(props: DilComponentProps) {
        invoke = props.invoke;
        return createElement("button", null, "Action");
      }
      renderToStaticMarkup(
        createElement(CustomComponent, {
          component: Component,
          name: "Action",
          attributes: {
            onClick: (value: unknown) => values.push(value),
            label: "not callable",
          },
          config: {},
          className: "",
          slots: {},
          ready,
          children: null,
        }),
      );
      invoke("onClick", 42);
      invoke("label");
      invoke("missing");
      expect(values).toEqual(ready ? [42] : []);
    },
  );
  it("accepts default host appearance and scoped instrumentation callbacks", async () => {
    const html = await renderComplete(
      createElement(DilRenderer, {
        mode: "host",
        text: "",
        showStatus: false,
        components: {},
        componentConfig: {},
        classNames: {},
        slots: {},
        onInput: () => {},
        onCommit: () => {},
        progressiveReveal: true,
      }),
    );
    expect(html).toContain('data-theme="light"');
  });
  it("defaults to the sandboxed stock frame and supports a nested asset base", () => {
    const html = renderToStaticMarkup(
      createElement(DilRenderer, {
        text: "# Hello",
        runtimeBaseUrl: "/nested/assets/",
      }),
    );
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toContain("allow-same-origin");
    expect(html).toContain('src="/nested/assets/frame.html"');
  });
  it("keeps host styling on its renderer root", async () => {
    const html = await renderComplete(
      createElement(DilRenderer, {
        mode: "host",
        text: "# Hello",
        className: "consumer-root",
        appearance: "dark",
        tokens: { "--primary": "purple" },
      }),
    );
    expect(html).toContain('class="dil-scope consumer-root"');
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain("--primary:purple");
    expect(html).not.toContain("<iframe");
  });
  it("rejects isolated customization supplied by a JavaScript consumer", () => {
    const props = Object.assign(
      { text: "# Hello" },
      { components: {}, className: "x" },
    );
    const invalid = createElement(
      DilRenderer,
      // @ts-expect-error Exercise the runtime guard for untyped JavaScript consumers.
      props,
    );
    expect(() => renderToStaticMarkup(invalid)).toThrow(
      'customization (components, className) requires mode="host"',
    );
  });
  it.each([
    ["markdownComponents", { markdownComponents: {} }],
    ["diagnostics", { diagnostics: { console: false } }],
    ["theme", { theme: "inherit" }],
  ])("keeps %s out of the iframe mode", (name, extra) => {
    const invalid = createElement(
      DilRenderer,
      // @ts-expect-error Exercise the runtime guard for untyped JavaScript consumers.
      Object.assign({ text: "# Hello" }, extra),
    );
    expect(() => renderToStaticMarkup(invalid)).toThrow(
      `customization (${name}) requires mode="host"`,
    );
  });
  it("marks a host renderer that inherits the page's design variables", async () => {
    const html = await renderComplete(
      createElement(DilRenderer, { mode: "host", text: "", theme: "inherit" }),
    );
    expect(html).toContain('data-dil-theme="inherit"');
    const stock = await renderComplete(
      createElement(DilRenderer, { mode: "host", text: "" }),
    );
    expect(stock).toContain('data-dil-theme="stock"');
  });
  it("treats undefined styling props as unset in the iframe mode", () => {
    const html = renderToStaticMarkup(
      createElement(DilRenderer, {
        mode: undefined,
        text: "# Hello",
        appearance: undefined,
        tokens: undefined,
        className: undefined,
        components: undefined,
        shadowStyles: undefined,
        runtimeBaseUrl: undefined,
      }),
    );
    expect(html).toContain('src="/opendil/frame.html"');
    expect(html).toContain('data-theme="light"');
  });
  it("themes the iframe renderer and keeps only safe tokens", () => {
    const html = renderToStaticMarkup(
      createElement(DilRenderer, {
        text: "# Hello",
        appearance: "dark",
        tokens: {
          "--background": "transparent",
          "--primary": "url(https://example.com/x.png)",
        },
      }),
    );
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain("--background:transparent");
    expect(html).toContain("color-scheme:dark");
    expect(html).not.toContain("example.com");
    // Content-sized: nothing is reserved before the frame reports its height.
    expect(html).toContain("height:0");
  });
  it("forwards custom configuration and slots without exposing renderer internals", () => {
    function Component(props: DilComponentProps) {
      return createElement(
        "aside",
        { className: props.className },
        String(props.config.label),
        createElement("span", { className: props.slots.body }, props.children),
      );
    }
    const html = renderToStaticMarkup(
      createElement(
        CustomizationContext.Provider,
        { value: {} },
        createElement(CustomComponent, {
          component: Component,
          name: "Callout",
          attributes: {},
          config: { label: "Configured" },
          className: "consumer-class",
          slots: { body: "consumer-slot" },
          ready: true,
          children: "Child content",
        }),
      ),
    );
    expect(html).toContain("Configured");
    expect(html).toContain('class="consumer-class"');
    expect(html).toContain('class="consumer-slot"');
    expect(html).toContain("Child content");
  });
});
describe("host components that validate their attributes", () => {
  it("receive quoted strings and JSON literals, and nothing for other values", () => {
    vi.stubGlobal("__DIL_VM_WORKER__", "");
    const uninstall = installInlineWorkers();
    const keys: unknown[] = [];
    function ArtifactFile({ attributes }: DilComponentProps) {
      keys.push(attributes.fileKey);
      const key =
        typeof attributes.fileKey === "string" ? attributes.fileKey : "";
      return createElement("span", { "data-file-key": key || "unbound" });
    }
    const document = new DilDocument();
    document.apply(
      new DilParser().append(
        '<ArtifactFile fileKey="a"/><ArtifactFile fileKey={"b"}/><ArtifactFile/><ArtifactFile fileKey={key}/>',
        true,
      ),
    );
    const html = renderToStaticMarkup(
      createElement(
        CustomizationContext.Provider,
        { value: { components: { ArtifactFile } } },
        createElement(NodeView, { id: 0, document }),
      ),
    );
    expect(keys).toEqual(["a", "b", undefined]);
    expect(html).toContain('data-file-key="a"');
    expect(html).toContain('data-file-key="b"');
    expect(html).toContain('data-file-key="unbound"');
    // An expression the host cannot see yet renders a pending placeholder.
    expect(html).toContain('data-dil-pending="true"');
    document.engine.dispose();
    uninstall();
    vi.unstubAllGlobals();
  });
});
