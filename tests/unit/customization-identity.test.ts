// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DilRenderer,
  preloadHostRenderer,
} from "../../packages/opendil/src/dil/dil-renderer";
import type { DilComponentProps } from "../../packages/opendil/src/dil/customization";
import type { DilButtonProps } from "../../packages/opendil/src/dil/ui-primitives";
import { sameRecord } from "../../packages/opendil/src/dil/stable-record";
import { installInlineWorkers } from "../../packages/opendil/src/testing";

const received: { config: unknown[]; slots: unknown[] } = {
  config: [],
  slots: [],
};
// A host component with its own state, which a remount would reset.
function Counter({ config, slots, className }: DilComponentProps) {
  const [count, setCount] = useState(0);
  received.config.push(config);
  received.slots.push(slots);
  return createElement(
    "button",
    {
      type: "button",
      className,
      "data-label": String(config.label),
      onClick: () => setCount((value) => value + 1),
    },
    "Count " + count,
  );
}
function HostButton({
  variant: _variant,
  size: _size,
  ...props
}: DilButtonProps) {
  return createElement("button", { ...props, "data-host": "button" });
}
const components = { Counter };

let mount: HTMLDivElement;
let root: Root;
let uninstall: () => void;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("__DIL_PARSER_WORKER__", "");
  vi.stubGlobal("__DIL_VM_WORKER__", "");
  vi.stubGlobal("__DIL_STYLES__", ".dil-scope{color:black}");
  uninstall = installInlineWorkers();
  received.config.length = 0;
  received.slots.length = 0;
  await preloadHostRenderer();
  mount = document.createElement("div");
  document.body.append(mount);
  root = createRoot(mount);
});
afterEach(async () => {
  await act(() => root.unmount());
  mount.remove();
  uninstall();
  vi.unstubAllGlobals();
});
// Every call passes new customization objects with the same content, as a
// host that writes them inline in its render function does.
function render(label = "Total", mode: "host" | "shadow" = "host") {
  return act(() =>
    root.render(
      createElement(DilRenderer, {
        mode,
        text: "<Counter/>",
        showStatus: false,
        components: { ...components },
        componentConfig: { Counter: { label, format: { digits: 2 } } },
        slots: { Counter: { badge: "badge" } },
        classNames: { Counter: "counter" },
        uiPrimitives: { Button: HostButton },
        tokens: { "--primary": "rgb(1, 2, 3)" },
      }),
    ),
  );
}
function scope(mode: "host" | "shadow") {
  return mode === "shadow"
    ? (mount.querySelector("[data-dil-mode=shadow]")?.shadowRoot ?? mount)
    : mount;
}

describe("customization identity", () => {
  it.each(["host", "shadow"] as const)(
    "keeps the %s document and its state when the host re-creates customization objects",
    async (mode) => {
      await render("Total", mode);
      const ui = scope(mode);
      const document = ui.querySelector("[data-dil-document]");
      expect(document?.getAttribute("data-dil-document")).toBe("dil");
      const counter = ui.querySelector<HTMLButtonElement>(".counter");
      if (!counter) throw new Error("Missing custom component");
      await act(() => counter.click());
      expect(counter.textContent).toBe("Count 1");
      const config = received.config.at(-1);
      for (let index = 0; index < 3; index++) await render("Total", mode);
      expect(ui.querySelector("[data-dil-document]")).toBe(document);
      expect(ui.querySelector(".counter")).toBe(counter);
      expect(counter.textContent).toBe("Count 1");
      // Same content keeps the same objects, so widgets see no change.
      expect(new Set(received.config.slice(1)).size).toBe(1);
      expect(received.config.at(-1)).toBe(config);
    },
  );
  it("passes changed content through without remounting", async () => {
    await render("Total");
    const counter = mount.querySelector<HTMLButtonElement>(".counter");
    if (!counter) throw new Error("Missing custom component");
    await act(() => counter.click());
    await render("Sum");
    expect(mount.querySelector(".counter")).toBe(counter);
    expect(counter.dataset.label).toBe("Sum");
    expect(counter.textContent).toBe("Count 1");
  });
});

describe("sameRecord", () => {
  it("compares plain objects to the given depth and everything else by identity", () => {
    const run = () => {};
    expect(sameRecord({ a: { b: 1 } }, { a: { b: 1 } }, 2)).toBe(true);
    expect(sameRecord({ a: { b: { c: 1 } } }, { a: { b: { c: 1 } } }, 2)).toBe(
      false,
    );
    expect(sameRecord({ a: run }, { a: run }, 1)).toBe(true);
    expect(sameRecord({ a: run }, { a: () => {} }, 1)).toBe(false);
    expect(sameRecord({ a: 1 }, { a: 1, b: undefined }, 1)).toBe(false);
    expect(sameRecord([1], [1], 2)).toBe(false);
    expect(sameRecord(undefined, undefined, 2)).toBe(true);
  });
});
