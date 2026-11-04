import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { describe, expect, it } from "vitest";
import {
  DilRenderer,
  preloadHostRenderer,
} from "../../packages/opendil/src/dil/dil-renderer";
import {
  CustomizationContext,
  type DilComponentProps,
} from "../../packages/opendil/src/dil/customization";
import { CustomComponent } from "../../packages/opendil/src/dil/custom-component";

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
