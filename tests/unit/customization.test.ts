import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DilRenderer } from "../../packages/opendil/src/dil/dil-renderer";
import {
  CustomizationContext,
  type DilComponentProps,
} from "../../packages/opendil/src/dil/customization";
import { CustomComponent } from "../../packages/opendil/src/dil/custom-component";

describe("public renderer configuration", () => {
  it("accepts explicitly chosen shadow styling without changing the iframe default", () => {
    const html = renderToStaticMarkup(
      createElement(DilRenderer, {
        mode: "shadow",
        text: "",
        shadowStyles: ".consumer{color:blue}",
        className: "consumer",
      }),
    );
    expect(html).not.toContain("<iframe");
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
  it("accepts default host appearance and scoped instrumentation callbacks", () => {
    const html = renderToStaticMarkup(
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
  it("keeps host styling on its renderer root", () => {
    const html = renderToStaticMarkup(
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
    const props = Object.assign({ text: "# Hello" }, { components: {} });
    const invalid = createElement(
      DilRenderer,
      // @ts-expect-error Exercise the runtime guard for untyped JavaScript consumers.
      props,
    );
    expect(() => renderToStaticMarkup(invalid)).toThrow(
      "customization requires",
    );
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
