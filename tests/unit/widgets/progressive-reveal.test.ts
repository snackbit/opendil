// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement, StrictMode, useRef } from "react";
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
import type { RendererViewport } from "../../../packages/opendil/src/dil/renderer-environment";
import { DilDocument } from "../../../packages/opendil/src/dil/runtime/document";
import { FrameViewportReporter } from "../../../packages/opendil/src/dil/isolation/frame-viewport";
import { ScrollRootTracker } from "../../../packages/opendil/src/dil/view/scroll/root-tracker";
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
  controller.setStreaming(true);
  controller.revealFrom = 0;
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
  // Shown content is left alone: no attribute, style or layout read.
  expect(replacement.element.dataset.dilPhase).toBeUndefined();
  expect(replacement.element.style.opacity).toBe("");
  expect(replacement.element.inert).toBe(false);
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
  controller.prime({ staggerMs: 50, durationMs: 180 }, true, 0);
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
    viewport,
  }: {
    present: boolean;
    active: boolean;
    empty: boolean;
    id: string;
    viewport?: RendererViewport;
  }) {
    const ref = useRef<HTMLDivElement>(null);
    const reveal = useProgressiveReveal(
      ref,
      active,
      empty ? null : model,
      viewport,
      true,
      0,
    );
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
  // The iframe runtime's viewport: offsets from the frame top, which does not scroll.
  const viewport: RendererViewport = {
    offset: 0,
    height: 900,
    width: 1250,
    origin: () => 0,
    subscribe: () => () => {},
    scrollTo() {},
  };
  await act(() =>
    reactRoot.render(
      createElement(Probe, {
        key: "d",
        present: true,
        active: true,
        empty: false,
        id: "d",
        viewport,
      }),
    ),
  );
  paint();
  await act(() => reactRoot.unmount());
  model.engine.dispose();
});
it("reveals first-mount and later targets when React replays effects", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const model = new DilDocument();
  function Item({ id }: { id: string }) {
    const ref = usePresentationTarget(id);
    return createElement("p", { ref, id }, id);
  }
  function Renderer({ ids }: { ids: string[] }) {
    const ref = useRef<HTMLDivElement>(null);
    const reveal = useProgressiveReveal(ref, true, model, undefined, true, 0);
    return createElement(
      "div",
      { ref },
      createElement(
        RevealContext.Provider,
        { value: reveal },
        ids.map((id) => createElement(Item, { key: id, id })),
      ),
    );
  }
  // StrictMode detaches and reattaches refs and layout effects of every new fiber.
  const reactRoot = createRoot(root);
  const render = (ids: string[]) =>
    act(() =>
      reactRoot.render(
        createElement(StrictMode, null, createElement(Renderer, { ids })),
      ),
    );
  const item = (id: string) => root.querySelector<HTMLElement>("#" + id)!;
  await render(["first"]);
  expect(item("first").style.opacity).toBe("0");
  paint();
  expect(animations).toHaveLength(1);
  expect(item("first").dataset.dilPhase).toBe("revealing");
  animations[0]?.onfinish?.();
  // Content that arrives later, such as streamed blocks or action results.
  await render(["first", "later"]);
  paint();
  expect(animations).toHaveLength(2);
  expect(item("later").inert).toBe(true);
  animations[1]?.onfinish?.();
  expect(item("later").style.opacity).toBe("");
  expect(item("later").inert).toBe(false);
  // Revealed blocks keep their history when their view is replaced.
  await render([]);
  await render(["first", "later"]);
  paint();
  expect(animations).toHaveLength(2);
  expect(item("first").dataset.dilPhase).toBeUndefined();
  expect(item("first").style.opacity).toBe("");
  await act(() => reactRoot.unmount());
});
it("reveals the first screen of an iframe whose height trails its content", () => {
  // The content-sized iframe starts 0 px tall, 100 px below the window top.
  const frame = document.createElement("div") as unknown as HTMLIFrameElement;
  root.append(frame);
  frame.getBoundingClientRect = () => new DOMRect(0, 100, 500, 0);
  const post = vi.fn();
  const reporter = new FrameViewportReporter(
    frame,
    new ScrollRootTracker(),
    post,
  );
  expect(post).toHaveBeenLastCalledWith(
    expect.objectContaining({ offset: 0, height: innerHeight - 100 }),
  );
  // A leading heading sizes the frame to 20 px before the blocks under it
  // arrive; content added below its bottom still lands in the visible part.
  frame.getBoundingClientRect = () => new DOMRect(0, 100, 500, 20);
  window.dispatchEvent(new Event("resize"));
  expect(post).toHaveBeenLastCalledWith(
    expect.objectContaining({ offset: 0, height: innerHeight - 100 }),
  );
  // A frame scrolled out above the window shows nothing.
  frame.getBoundingClientRect = () => new DOMRect(0, -100, 500, 20);
  window.dispatchEvent(new Event("resize"));
  expect(post).toHaveBeenLastCalledWith(
    expect.objectContaining({ offset: 100, height: 0 }),
  );
  frame.getBoundingClientRect = () => new DOMRect(0, 100, 500, 20);
  window.dispatchEvent(new Event("resize"));
  // The frame's next commit sees that viewport, as frame.tsx records it.
  const { offset, height } = post.mock.lastCall![0];
  dispose();
  controller = new RevealController(new PresentationHistory(), () => ({
    top: offset,
    bottom: offset + height,
  }));
  controller.prime({ staggerMs: 50, durationMs: 180 }, true, 0);
  dispose = controller.start();
  const [below, offscreen] = [400, innerHeight + 200].map((top, index) => {
    const element = document.createElement("div");
    root.append(element);
    element.getBoundingClientRect = () => new DOMRect(0, top, 500, 40);
    controller.register("block:" + index, element, true, false);
    return element;
  });
  paint();
  expect(animations).toHaveLength(1);
  expect(below?.dataset.dilPhase).toBe("revealing");
  expect(offscreen?.dataset.dilPhase).toBe("visible");
  reporter.dispose();
});
it("shows content at once where the DOM cannot animate", () => {
  // jsdom, which host test suites often use, has no Element.animate.
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: undefined,
  });
  const plain = target("plain");
  paint();
  expect(plain.element.style.opacity).toBe("");
  expect(plain.element.dataset.dilPhase).toBe("visible");
  expect(animations).toHaveLength(0);
});
it("leaves text present at mount, finished answers and disabled reveal untouched", async () => {
  const measure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
  const element = () => {
    const created = document.createElement("p");
    root.append(created);
    return created;
  };
  controller.revealFrom = 100;
  const prefix = element();
  controller.register("prefix", prefix, true, false, 40);
  controller.setStreaming(false);
  const finished = element();
  controller.register("finished", finished, true, false, 200);
  controller.setStreaming(true);
  controller.configure(null);
  const disabled = element();
  controller.register("disabled", disabled, true, false, 200);
  await Promise.resolve();
  paint();
  expect(measure).not.toHaveBeenCalled();
  expect(animations).toHaveLength(0);
  for (const shown of [prefix, finished, disabled]) {
    expect(shown.getAttributeNames()).toEqual([]);
    expect(shown.inert).toBe(false);
  }
});
it("reveals only text that arrives while streaming and shows it all when the stream ends", async () => {
  controller.revealFrom = 10;
  const arrived = document.createElement("p"),
    queued = document.createElement("p"),
    after = document.createElement("p");
  root.append(arrived, queued, after);
  controller.register("arrived", arrived, true, false, 20);
  // Hidden before the next paint, so it never flashes.
  await Promise.resolve();
  expect(arrived.style.opacity).toBe("0");
  paint();
  expect(arrived.dataset.dilPhase).toBe("revealing");
  controller.register("queued", queued, true, false, 30);
  await Promise.resolve();
  expect(queued.inert).toBe(true);
  controller.setStreaming(false);
  for (const shown of [arrived, queued]) {
    expect(shown.style.opacity).toBe("");
    expect(shown.inert).toBe(false);
    expect(shown.dataset.dilPhase).toBe("visible");
  }
  expect(animations[0]?.cancel).toHaveBeenCalled();
  // Late values, charts and diagrams of a finished answer never fade.
  controller.register("after", after, true, false, 40);
  await Promise.resolve();
  paint();
  expect(after.getAttributeNames()).toEqual([]);
  expect(animations).toHaveLength(1);
});
