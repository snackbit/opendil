// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement, useRef } from "react";
import { createRoot } from "react-dom/client";
import { RevealController } from "../../../packages/opendil/src/dil/view/reveal/controller";
import { PresentationHistory } from "../../../packages/opendil/src/dil/runtime/presentation-history";
import {
  RevealContext,
  VirtualPresentation,
  BranchPresentation,
  usePresentationKey,
  usePresentationTarget,
} from "../../../packages/opendil/src/dil/view/reveal/presentation";
import {
  revealDelay,
  useProgressiveReveal,
} from "../../../packages/opendil/src/dil/view/progressive-reveal";
import { RendererEnvironmentContext } from "../../../packages/opendil/src/dil/renderer-environment";
import { DilDocument } from "../../../packages/opendil/src/dil/runtime/document";
interface TestAnimation {
  cancel: () => void;
  onfinish: (() => void) | null;
  oncancel: (() => void) | null;
}
const frames: FrameRequestCallback[] = [],
  animations: TestAnimation[] = [];
const media = Object.assign(new EventTarget(), { matches: false });
let root: HTMLDivElement,
  controller: RevealController,
  dispose = () => {};
let originalAnimate: PropertyDescriptor | undefined;
beforeEach(() => {
  root = document.createElement("div");
  document.body.append(root);
  controller = new RevealController(new PresentationHistory(), () => ({
    top: 0,
    bottom: 900,
  }));
  originalAnimate = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "animate",
  );
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: vi.fn(() => {
      const animation: TestAnimation = {
        cancel: vi.fn(),
        onfinish: null,
        oncancel: null,
      };
      animations.push(animation);
      return animation;
    }),
  });
  media.matches = false;
  vi.stubGlobal("matchMedia", () => media);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    frames.push(callback),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  controller.configure({ staggerMs: 50, durationMs: 180 });
  dispose = controller.start();
});
afterEach(() => {
  dispose();
  root.remove();
  frames.splice(0);
  animations.splice(0);
  if (originalAnimate)
    Object.defineProperty(HTMLElement.prototype, "animate", originalAnimate);
  else Reflect.deleteProperty(HTMLElement.prototype, "animate");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function paint() {
  for (const frame of frames.splice(0)) frame(performance.now());
}
function target(
  key: string,
  parent: HTMLElement = root,
  eligible = true,
  skip = false,
) {
  const element = document.createElement("div");
  parent.append(element);
  const cleanup = controller.register(key, element, eligible, skip);
  return { element, cleanup };
}
it("reveals once per logical identity and never hides a replacement view", () => {
  const first = target("record:1");
  paint();
  expect(first.element.style.opacity).toBe("0");
  animations[0]?.onfinish?.();
  expect(first.element.style.opacity).toBe("");
  first.cleanup();
  first.element.remove();
  const replacement = target("record:1");
  paint();
  expect(animations).toHaveLength(1);
  expect(replacement.element.dataset.dilPhase).toBe("visible");
});
it("covers children with their parent's reveal and staggers only visual siblings", () => {
  const parent = document.createElement("div"),
    child = document.createElement("div");
  parent.append(child);
  root.append(parent);
  controller.register("child", child, true, false);
  controller.register("parent", parent, true, false);
  target("sibling");
  target("layout", root, false);
  paint();
  expect(animations).toHaveLength(2);
  expect(child.style.opacity).toBe("");
  expect(HTMLElement.prototype.animate).toHaveBeenNthCalledWith(
    2,
    expect.any(Array),
    expect.objectContaining({ delay: expect.any(Number), duration: 180 }),
  );
});
it("honors custom timing, disables without replay, and restores inert state", () => {
  controller.configure({ staggerMs: 40, durationMs: 240 });
  const first = target("first");
  target("second");
  paint();
  expect(first.element.inert).toBe(true);
  expect(HTMLElement.prototype.animate).toHaveBeenCalledWith(
    expect.any(Array),
    expect.objectContaining({ duration: 240 }),
  );
  controller.configure(null);
  expect(first.element.inert).toBe(false);
  expect(animations[0]?.cancel).toHaveBeenCalled();
  controller.configure({ staggerMs: 50, durationMs: 180 });
  first.cleanup();
  controller.register("first", first.element, true, false);
  paint();
  expect(animations).toHaveLength(2);
  expect(revealDelay(100, 40)).toBe(240);
});
it("shows focused, offscreen, reduced-motion, returning, and detached content immediately", () => {
  const focused = document.createElement("button");
  root.append(focused);
  focused.focus();
  controller.register("focused", focused, true, false);
  const offscreen = document.createElement("div");
  root.append(offscreen);
  vi.spyOn(offscreen, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 2000, 10, 20),
  );
  controller.register("offscreen", offscreen, true, false);
  target("returning", root, true, true);
  media.matches = true;
  media.dispatchEvent(new Event("change"));
  target("reduced");
  controller.register("detached", document.createElement("div"), true, false);
  paint();
  expect(animations).toHaveLength(0);
});
it("cancels removed views and reacts to motion preferences without flashing", () => {
  const first = target("first");
  paint();
  first.cleanup();
  expect(animations[0]?.cancel).toHaveBeenCalled();
  target("second");
  paint();
  media.matches = true;
  media.dispatchEvent(new Event("change"));
  expect(animations[1]?.cancel).toHaveBeenCalled();
  expect(controller.history.phase("second")).toBe("visible");
});
it("restores caller styles when animations cancel or reveal is disabled before paint", () => {
  const element = document.createElement("div");
  element.style.opacity = "0.8";
  element.inert = true;
  root.append(element);
  const oldCleanup = controller.register("same", element, true, false);
  paint();
  expect(HTMLElement.prototype.animate).toHaveBeenCalledWith(
    [{ opacity: 0 }, { opacity: "0.8" }],
    expect.any(Object),
  );
  controller.register("same", element, true, false);
  oldCleanup();
  paint();
  expect(element.dataset.dilPhase).toBe("visible");
  expect(element.style.opacity).toBe("0.8");
  expect(element.inert).toBe(true);
  const cancellable = target("cancelled");
  paint();
  animations[1]?.oncancel?.();
  expect(cancellable.element.dataset.dilPhase).toBe("visible");
  target("disabled-before-paint");
  controller.configure(null);
  paint();
  expect(controller.history.phase("disabled-before-paint")).toBe("visible");
});
it("queues registrations until committed startup and keeps history scoped", () => {
  dispose();
  const history = new PresentationHistory();
  controller = new RevealController(history, () => ({ top: 0, bottom: 900 }));
  controller.configure({ staggerMs: 50, durationMs: 180 });
  const first = target("branch/first");
  dispose = controller.start();
  paint();
  expect(animations).toHaveLength(1);
  history.remember("branch/first", { value: 1 });
  history.remember("branch/layout", { value: 2 });
  history.visit("branch/row");
  expect(history.last("branch/first")).toEqual({ value: 1 });
  first.cleanup();
  history.forget("branch/");
  expect(history.phase("branch/first")).toBeUndefined();
  expect(history.last("branch/layout")).toBeUndefined();
  expect(history.visited("branch/row")).toBe(false);
  expect(history.visited("row")).toBe(false);
  history.visit("row");
  expect(history.visited("row")).toBe(true);
});
it("uses committed component refs and suppresses viewport-only mounts", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let itemKey = "";
  function Item() {
    const ref = usePresentationTarget("value");
    itemKey = usePresentationKey("value");
    return createElement("div", { ref }, "Value");
  }
  const reactRoot = createRoot(root);
  await act(() =>
    reactRoot.render(
      createElement(
        RevealContext.Provider,
        { value: controller },
        createElement(VirtualPresentation, {
          identity: "row",
          returning: true,
          children: createElement(Item),
        }),
      ),
    ),
  );
  paint();
  expect(animations).toHaveLength(0);
  await act(() =>
    reactRoot.render(
      createElement(
        RevealContext.Provider,
        { value: controller },
        createElement(BranchPresentation, { children: createElement(Item) }),
      ),
    ),
  );
  paint();
  expect(animations).toHaveLength(1);
  await act(() => reactRoot.unmount());
  expect(controller.history.phase(itemKey)).toBeUndefined();
});
it("allows standalone presentation components without an animation controller", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  function Item() {
    const ref = usePresentationTarget("value");
    return createElement("div", { ref }, usePresentationKey("value"));
  }
  const reactRoot = createRoot(root);
  await act(() =>
    reactRoot.render(
      createElement(VirtualPresentation, {
        identity: "standalone",
        returning: false,
        children: createElement(BranchPresentation, {
          children: createElement(Item),
        }),
      }),
    ),
  );
  expect(root.textContent).toMatch(/^\/standalone\/branch:.*\/value$/);
  expect(animations).toHaveLength(0);
  await act(() => reactRoot.unmount());
});
it("attaches the lifecycle to committed messages and their actual viewport", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("__DIL_VM_WORKER__", "");
  vi.stubGlobal(
    "Worker",
    class {
      postMessage() {}
      terminate() {}
    },
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  const model = new DilDocument();
  function Item({ id }: { id: string }) {
    const ref = usePresentationTarget(id);
    return createElement("div", { ref }, "Item");
  }
  function Probe({
    present,
    active,
    empty,
    id,
  }: {
    present: boolean;
    active: boolean;
    empty: boolean;
    id: string;
  }) {
    const ref = useRef<HTMLDivElement>(null);
    const reveal = useProgressiveReveal(ref, active, empty ? null : model);
    return present
      ? createElement(
          "div",
          { ref },
          createElement(
            RevealContext.Provider,
            { value: reveal },
            createElement(Item, { id }),
          ),
        )
      : null;
  }
  const reactRoot = createRoot(root);
  await act(() =>
    reactRoot.render(
      createElement(Probe, {
        key: "a",
        present: false,
        active: false,
        empty: false,
        id: "a",
      }),
    ),
  );
  await act(() =>
    reactRoot.render(
      createElement(Probe, {
        key: "b",
        present: true,
        active: false,
        empty: true,
        id: "b",
      }),
    ),
  );
  await act(() =>
    reactRoot.render(
      createElement(Probe, {
        key: "c",
        present: true,
        active: true,
        empty: false,
        id: "c",
      }),
    ),
  );
  paint();
  const viewport = {
    offset: 0,
    revision: 1,
    height: 900,
    width: 1250,
    listeners: new Set<() => void>(),
  };
  await act(() =>
    reactRoot.render(
      createElement(
        RendererEnvironmentContext.Provider,
        { value: { viewport } },
        createElement(Probe, {
          key: "d",
          present: true,
          active: true,
          empty: false,
          id: "d",
        }),
      ),
    ),
  );
  paint();
  await act(() => reactRoot.unmount());
  model.engine.dispose();
});
