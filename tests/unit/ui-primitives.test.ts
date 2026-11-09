// @vitest-environment happy-dom
import {
  act,
  cloneElement,
  createContext,
  createElement,
  isValidElement,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DilRenderer,
  preloadHostRenderer,
} from "../../packages/opendil/src/dil/dil-renderer";
import type { DilRendererHandle } from "../../packages/opendil/src/dil/renderer-handle";
import {
  resolveUiPrimitives,
  STOCK_UI_PRIMITIVES,
  type DilButtonProps,
  type DilCheckboxProps,
  type DilInputProps,
  type DilPopoverContentProps,
  type DilPopoverTriggerProps,
  type DilRadioGroupItemProps,
  type DilRadioGroupProps,
  type DilSliderProps,
  type DilToggleGroupItemProps,
  type DilToggleGroupProps,
  type DilTooltipProps,
  type DilUiPrimitives,
} from "../../packages/opendil/src/dil/ui-primitives";
import { installInlineWorkers } from "../../packages/opendil/src/testing";

/* A minimal host design system: each primitive marks its element with data-host. */
const Choice = createContext<{
  value: string;
  choose: (value: string) => void;
}>({ value: "", choose: () => {} });
function Button({ variant, size, ...props }: DilButtonProps) {
  return createElement("button", {
    ...props,
    "data-host": "button",
    "data-variant": variant,
    "data-size": size,
  });
}
function Checkbox({
  checked,
  onCheckedChange,
  id,
  disabled,
}: DilCheckboxProps) {
  return createElement("button", {
    id,
    disabled,
    role: "checkbox",
    "aria-checked": checked,
    "data-host": "checkbox",
    onClick: () => onCheckedChange(!checked),
  });
}
function Input(props: DilInputProps) {
  return createElement("input", { ...props, "data-host": "input" });
}
function Slider({ value, min, max, "aria-label": label }: DilSliderProps) {
  return createElement("span", {
    role: "slider",
    tabIndex: 0,
    "aria-label": label,
    "aria-valuenow": value[0],
    "aria-valuemin": min,
    "aria-valuemax": max,
    "data-host": "slider",
  });
}
function choiceRoot(host: string) {
  return function Root(props: DilToggleGroupProps | DilRadioGroupProps) {
    const { ref, value, onValueChange, children, "aria-label": label } = props;
    const segmented = "segmented" in props && props.segmented;
    return createElement(
      Choice.Provider,
      { value: { value, choose: onValueChange } },
      createElement(
        "div",
        {
          ref,
          role: "radiogroup",
          "aria-label": label,
          "data-host": host,
          "data-segmented": segmented === true ? "" : undefined,
        },
        children,
      ),
    );
  };
}
function choiceItem(host: string) {
  return function Item(
    props: DilToggleGroupItemProps | DilRadioGroupItemProps,
  ) {
    const { value, choose } = useContext(Choice);
    return createElement(
      "button",
      {
        type: "button",
        role: "radio",
        "aria-checked": value === props.value,
        "data-host": host,
        onClick: () => choose(props.value),
      },
      "children" in props ? props.children : null,
    );
  };
}
const Open = createContext<{ open: boolean; toggle: () => void }>({
  open: false,
  toggle: () => {},
});
function PopoverRoot({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return createElement(
    Open.Provider,
    { value: { open, toggle: () => setOpen((value) => !value) } },
    children,
  );
}
function PopoverTrigger({ children }: DilPopoverTriggerProps) {
  const { open, toggle } = useContext(Open);
  return isValidElement<{ onClick?: () => void }>(children)
    ? cloneElement(children, {
        onClick: toggle,
        "aria-expanded": open,
      } as object)
    : null;
}
const containers: (HTMLElement | null)[] = [];
function PopoverContent({
  portalContainer,
  side,
  align,
  children,
}: DilPopoverContentProps) {
  const { open } = useContext(Open);
  containers.push(portalContainer);
  if (!open || !portalContainer) return null;
  return createPortal(
    createElement(
      "div",
      { "data-host": "popover", "data-side": side, "data-align": align },
      children,
    ),
    portalContainer,
  );
}
function Tooltip({ children, open, label, portalContainer }: DilTooltipProps) {
  return createElement(
    "span",
    { "data-host": "tooltip" },
    children,
    open && portalContainer ? createPortal(label, portalContainer) : null,
  );
}
const PRIMITIVES: DilUiPrimitives = {
  Button,
  Checkbox,
  Input,
  Slider,
  RadioGroup: { Root: choiceRoot("radio-group"), Item: choiceItem("radio") },
  ToggleGroup: {
    Root: choiceRoot("toggle-group"),
    Item: choiceItem("toggle-item"),
  },
  Popover: {
    Root: PopoverRoot,
    Trigger: PopoverTrigger,
    Content: PopoverContent,
  },
  Tooltip,
};
const SOURCE = [
  '<button variant="outline" size="sm">Save</button>',
  "<checkbox checked={true}>Done</checkbox>",
  '<input aria-label="Name" value={"Alex"}/>',
  '<slider aria-label="Volume" value={40} max={100}/>',
  '<segmented-control aria-label="Range" value={"week"} options={[{"value":"week","label":"Week"},{"value":"month","label":"Month"}]}/>',
  '<radio-group aria-label="Plan" value={"pro"}><radio value="basic">Basic</radio><radio value="pro">Pro</radio></radio-group>',
  '<popover><popover-trigger><button>Details</button></popover-trigger><popover-content side="top"><text>Inside the popover</text></popover-content></popover>',
].join("\n\n");

let mount: HTMLDivElement;
let root: Root;
let uninstall: () => void;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("__DIL_PARSER_WORKER__", "");
  vi.stubGlobal("__DIL_VM_WORKER__", "");
  vi.stubGlobal("__DIL_STYLES__", ".dil-scope{color:black}");
  uninstall = installInlineWorkers();
  containers.length = 0;
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
async function show(
  mode: "host" | "shadow",
  uiPrimitives: DilUiPrimitives | undefined,
  ref?: (handle: DilRendererHandle | null) => void,
) {
  await act(() =>
    root.render(
      createElement(DilRenderer, {
        mode,
        text: SOURCE,
        showStatus: false,
        ...(uiPrimitives ? { uiPrimitives } : {}),
        ...(ref ? { ref } : {}),
      }),
    ),
  );
  return mode === "shadow"
    ? (mount.querySelector("[data-dil-mode=shadow]")?.shadowRoot ?? mount)
    : mount;
}

describe("injected UI primitives", () => {
  it.each(["host", "shadow"] as const)(
    "render the stock controls of a %s renderer with OpenDIL's props",
    async (mode) => {
      const scope = await show(mode, PRIMITIVES);
      const host = (name: string) =>
        [...scope.querySelectorAll(`[data-host="${name}"]`)] as HTMLElement[];
      const save = host("button").find((item) => item.textContent === "Save");
      expect(save?.dataset.variant).toBe("outline");
      expect(save?.dataset.size).toBe("sm");
      expect(save?.hasAttribute("data-dil-action")).toBe(true);
      expect(host("checkbox")[0]?.getAttribute("aria-checked")).toBe("true");
      expect((host("input")[0] as HTMLInputElement | undefined)?.value).toBe(
        "Alex",
      );
      expect(host("slider")[0]?.getAttribute("aria-valuenow")).toBe("40");
      expect(host("toggle-group")[0]?.hasAttribute("data-segmented")).toBe(
        true,
      );
      expect(
        host("toggle-item").map((item) => item.getAttribute("aria-checked")),
      ).toEqual(["true", "false"]);
      expect(
        host("radio").map((item) => item.getAttribute("aria-checked")),
      ).toEqual(["false", "true"]);
      expect(host("tooltip").length).toBeGreaterThan(0);
      // Nothing of the stock set remains.
      expect(scope.querySelector('[data-slot="checkbox"]')).toBeNull();
      expect(scope.querySelector('[data-slot="toggle-group"]')).toBeNull();

      // Overlays portal into the renderer's own scope, inside a ShadowRoot too.
      const portals = scope.querySelector(".dil-scope > [data-dil-portals]");
      expect(portals).not.toBeNull();
      expect(containers.at(-1)).toBe(portals);
      const details = host("button").find(
        (item) => item.textContent === "Details",
      );
      await act(() => details?.click());
      const content = portals?.querySelector('[data-host="popover"]');
      expect(content?.textContent).toBe("Inside the popover");
      expect(content?.getAttribute("data-side")).toBe("top");
      expect(details?.getAttribute("aria-expanded")).toBe("true");

      // A host control reports input through OpenDIL's state binding.
      await act(() => host("checkbox")[0]?.click());
      expect(host("checkbox")[0]?.getAttribute("aria-checked")).toBe("false");
    },
  );
  it("keeps stock primitives that the host does not replace", async () => {
    const scope = await show("host", { Button });
    expect(scope.querySelector('[data-host="button"]')).not.toBeNull();
    expect(scope.querySelector('[data-slot="checkbox"]')).not.toBeNull();
    expect(scope.querySelector('[data-slot="toggle-group"]')).not.toBeNull();
    expect(scope.querySelector('[data-slot="input"]')).not.toBeNull();
  });
  it("serializes injected controls by their accessible state", async () => {
    let handle: DilRendererHandle | null = null;
    await show("host", PRIMITIVES, (value) => {
      handle = value;
    });
    const copy = (handle as DilRendererHandle | null)?.serialize();
    expect(copy?.markdown.split("\n\n")).toEqual([
      "[x] Done",
      "Alex",
      "Volume: 40",
      "(x) Week ( ) Month",
      "( ) Basic",
      "(x) Pro",
    ]);
    expect(copy?.html).not.toContain("Save");
    expect(copy?.html).not.toContain("Inside the popover");
  });
  it("resolves the stock set when the host passes none", () => {
    expect(resolveUiPrimitives(undefined)).toBe(STOCK_UI_PRIMITIVES);
    const resolved = resolveUiPrimitives({ Tooltip, Button: undefined });
    expect(resolved.Tooltip).toBe(Tooltip);
    expect(resolved.Button).toBe(STOCK_UI_PRIMITIVES.Button);
  });
  it("is rejected in the iframe mode", () => {
    const invalid = createElement(
      DilRenderer,
      // @ts-expect-error Exercise the runtime guard for untyped JavaScript consumers.
      { text: "<button>Go</button>", uiPrimitives: PRIMITIVES },
    );
    expect(() => renderToStaticMarkup(invalid)).toThrow(
      'customization (uiPrimitives) requires mode="host"',
    );
  });
});
