// @vitest-environment happy-dom
import {
  act,
  createElement,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  chosenScroller,
  readScrollContainer,
  scrollSettings,
} from "../../../packages/opendil/src/dil/view/scroll-options";
import {
  encloses,
  findScrollContainer,
  ScrollRoot,
} from "../../../packages/opendil/src/dil/view/scroll/scroll-root";
import {
  ScrollRootTracker,
  useScrollRoot,
} from "../../../packages/opendil/src/dil/view/scroll/root-tracker";
import { HostViewport } from "../../../packages/opendil/src/dil/view/scroll/host-viewport";
import { ScrollFollower } from "../../../packages/opendil/src/dil/view/scroll/controller";
import { listenForScrollAway } from "../../../packages/opendil/src/dil/view/stream-follow";
import { FrameViewportReporter } from "../../../packages/opendil/src/dil/isolation/frame-viewport";

// A chat layout: a 600px message list at y=100 scrolls; the page does not.
interface Observed {
  callback: () => void;
  targets: Set<Element>;
}
const observers: Observed[] = [];
const frames = new Map<number, FrameRequestCallback>();
let next = 0;
let mount: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      private readonly entry: Observed;
      constructor(callback: () => void) {
        this.entry = { callback, targets: new Set() };
        observers.push(this.entry);
      }
      observe(target: Element) {
        this.entry.targets.add(target);
      }
      unobserve(target: Element) {
        this.entry.targets.delete(target);
      }
      disconnect() {
        this.entry.targets.clear();
      }
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++next, callback);
    return next;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("innerHeight", 800);
  mount = document.createElement("div");
  document.body.append(mount);
});
afterEach(() => {
  mount.remove();
  observers.splice(0);
  frames.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function paint() {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(performance.now()));
}
function resized(target: Element) {
  for (const observer of observers)
    if (observer.targets.has(target)) observer.callback();
}
function box(element: Element, top: number, height: number, left = 0) {
  element.getBoundingClientRect = () => new DOMRect(left, top, 400, height);
}
/** An overflow container with controllable geometry and scroll position. */
function scroller(
  options: {
    overflow?: string;
    top?: number;
    height?: number;
    content?: number;
  } = {},
) {
  const element = document.createElement("div");
  element.style.overflowY = options.overflow ?? "auto";
  let scrollTop = 0;
  const geometry = {
    top: options.top ?? 100,
    height: options.height ?? 600,
    content: options.content ?? 3000,
  };
  Object.defineProperties(element, {
    clientHeight: { get: () => geometry.height, configurable: true },
    clientWidth: { get: () => 385, configurable: true },
    clientTop: { get: () => 0, configurable: true },
    clientLeft: { get: () => 0, configurable: true },
    scrollHeight: { get: () => geometry.content, configurable: true },
    scrollTop: {
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
      configurable: true,
    },
  });
  element.getBoundingClientRect = () =>
    new DOMRect(0, geometry.top, 400, geometry.height);
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    scrollTop = Math.max(
      0,
      Math.min(geometry.content - geometry.height, options.top ?? 0),
    );
  });
  element.scrollTo = scrollTo as typeof element.scrollTo;
  return { element, geometry, scrollTo };
}

it("validates the scrollContainer option at the API boundary", () => {
  const element = document.createElement("div");
  const ref = { current: null };
  expect(readScrollContainer(undefined)).toBe("auto");
  expect(readScrollContainer(null)).toBe("auto");
  expect(readScrollContainer("auto")).toBe("auto");
  expect(readScrollContainer("window")).toBe("window");
  expect(readScrollContainer(element)).toBe(element);
  expect(readScrollContainer(ref)).toBe(ref);
  for (const value of ["page", 3, {}, document.createTextNode("x")])
    expect(() => readScrollContainer(value)).toThrow("scrollContainer");
  expect(chosenScroller("window")).toBeNull();
  expect(chosenScroller("auto")).toBeUndefined();
  expect(chosenScroller(null)).toBeUndefined();
  expect(chosenScroller(element)).toBe(element);
  expect(chosenScroller({ current: element })).toBe(element);
  expect(chosenScroller({ current: null })).toBeUndefined();
  expect(
    chosenScroller(JSON.parse('{"current":"#log"}') as { current: null }),
  ).toBeUndefined();
  expect(scrollSettings(true)).toEqual({ behavior: "instant", padding: 0 });
});

it("finds the nearest scrolling ancestor across Shadow DOM and slots", () => {
  const log = scroller();
  // overflow-x:auto wrappers compute overflow-y to auto without scrolling vertically.
  const wrapper = scroller({ height: 200, content: 200 });
  const host = document.createElement("div");
  mount.append(log.element);
  log.element.append(wrapper.element);
  wrapper.element.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const target = document.createElement("div");
  shadow.append(target);
  expect(findScrollContainer(target)).toBe(log.element);
  expect(encloses(log.element, target)).toBe(true);
  expect(encloses(mount, log.element)).toBe(true);
  expect(encloses(target, log.element)).toBe(false);
  // overflow-y: scroll counts only once its content overflows.
  const always = scroller({ overflow: "scroll", content: 10 });
  mount.append(always.element);
  const child = document.createElement("div");
  always.element.append(child);
  expect(findScrollContainer(child)).toBeNull();
  always.geometry.content = 3000;
  expect(findScrollContainer(child)).toBe(always.element);
  // A wrapper that overflows by a few pixels (a nudged child) is not a scroller.
  const nudged = scroller({ height: 83, content: 85 });
  mount.append(nudged.element);
  const prose = document.createElement("div");
  nudged.element.append(prose);
  expect(findScrollContainer(prose)).toBeNull();
  nudged.geometry.content = 92;
  expect(findScrollContainer(prose)).toBe(nudged.element);
  // Slotted content belongs to the slot's tree.
  const component = document.createElement("div");
  log.element.append(component);
  const inner = component.attachShadow({ mode: "open" });
  const pane = scroller({ overflow: "overlay" });
  const slot = document.createElement("slot");
  inner.append(pane.element);
  pane.element.append(slot);
  const slotted = document.createElement("div");
  component.append(slotted);
  Object.defineProperty(slotted, "assignedSlot", { value: slot });
  expect(findScrollContainer(slotted)).toBe(pane.element);
  // Without a scroller, the window scrolls; hidden overflow does not count.
  const plain = document.createElement("div");
  const clipped = scroller({ overflow: "hidden" });
  mount.append(clipped.element);
  clipped.element.append(plain);
  expect(findScrollContainer(plain)).toBeNull();
  const detached = document.createElement("div");
  expect(findScrollContainer(detached)).toBeNull();
});

it("treats the body as a scroller only when the root element clips its overflow", () => {
  const { body, documentElement } = document;
  vi.spyOn(body, "scrollHeight", "get").mockReturnValue(3000);
  vi.spyOn(body, "clientHeight", "get").mockReturnValue(800);
  const target = document.createElement("div");
  mount.append(target);
  try {
    // By default the body's overflow scrolls the viewport, which is the window.
    // happy-dom computes no default, so spell out the browser's `visible`.
    documentElement.style.overflowY = "visible";
    body.style.overflowY = "auto";
    expect(findScrollContainer(target)).toBeNull();
    // App shells: html { overflow: hidden } body { height: 100vh; overflow-y: auto }.
    documentElement.style.overflowY = "hidden";
    expect(findScrollContainer(target)).toBe(body);
    // A body that does not scroll leaves the window.
    body.style.overflowY = "visible";
    expect(findScrollContainer(target)).toBeNull();
  } finally {
    body.style.overflowY = "";
    documentElement.style.overflowY = "";
  }
});

it("measures, scrolls and scopes the window and element scrollers", () => {
  vi.spyOn(window, "scrollY", "get").mockReturnValue(120);
  vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(
    2000,
  );
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(
    1000,
  );
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const page = new ScrollRoot(window, null);
  expect(page.top).toBe(120);
  expect(page.maximum).toBe(1200);
  expect(page.bounds()).toEqual({ top: 0, bottom: 800, width: 1000 });
  expect(page.anchor).toBe(document.documentElement);
  page.scrollTo(300);
  expect(scrollTo).toHaveBeenCalledWith({ top: 300, behavior: "instant" });
  expect(page.contains(new Event("wheel"))).toBe(true);
  expect(
    page.scrollbar(new PointerEvent("pointerdown", { clientX: 1004 })),
  ).toBe(true);
  const log = scroller({ top: 600, height: 600 });
  mount.append(log.element);
  const root = new ScrollRoot(window, log.element);
  log.element.scrollTop = 40;
  expect(root.top).toBe(40);
  expect(root.maximum).toBe(2400);
  expect(root.anchor).toBe(log.element);
  // Clipped to the window when it extends below it.
  expect(root.bounds()).toEqual({ top: 600, bottom: 800, width: 385 });
  log.geometry.top = 900;
  expect(root.bounds()).toEqual({ top: 900, bottom: 1500, width: 385 });
  root.scrollTo(500);
  expect(log.scrollTo).toHaveBeenCalledWith({ top: 500, behavior: "instant" });
  const inside = document.createElement("p");
  log.element.append(inside);
  let contained = false;
  inside.addEventListener(
    "wheel",
    (event) => (contained = root.contains(event)),
    {
      once: true,
    },
  );
  inside.dispatchEvent(new Event("wheel"));
  expect(contained).toBe(true);
  expect(root.contains(new Event("wheel"))).toBe(false);
  // composedPath() is only populated while the event is dispatched.
  const press = (target: HTMLElement, clientX: number) => {
    let pressed = false;
    target.addEventListener(
      "pointerdown",
      (event) => (pressed = root.scrollbar(event)),
      { once: true },
    );
    target.dispatchEvent(new PointerEvent("pointerdown", { clientX }));
    return pressed;
  };
  expect(press(log.element, 390)).toBe(true);
  expect(press(log.element, 200)).toBe(false);
  expect(press(inside, 390)).toBe(false);
});

it("tracks the scroller as layout changes and honors explicit choices", () => {
  const log = scroller({ content: 400 });
  const target = document.createElement("div");
  mount.append(log.element);
  log.element.append(target);
  const tracker = new ScrollRootTracker();
  const changed = vi.fn();
  tracker.subscribe(changed);
  expect(tracker.current).toBeNull();
  expect(tracker.rootFor(target)?.element).toBeNull();
  const stop = tracker.attach(target, "auto");
  // The list does not overflow yet, so the window is the scroller.
  expect(tracker.current?.element).toBeNull();
  expect(changed).toHaveBeenCalledTimes(1);
  log.geometry.content = 3000;
  resized(target);
  expect(tracker.current?.element).toBe(log.element);
  expect(tracker.rootFor(target)).toBe(tracker.current);
  expect(changed).toHaveBeenCalledTimes(2);
  resized(target);
  expect(changed).toHaveBeenCalledTimes(2);
  // Scrolling an unrelated element, or the current scroller, changes nothing.
  const other = scroller();
  mount.append(other.element);
  other.element.dispatchEvent(new Event("scroll"));
  log.element.dispatchEvent(new Event("scroll"));
  document.dispatchEvent(new Event("scroll"));
  expect(changed).toHaveBeenCalledTimes(2);
  // A scroll of an outer ancestor proves that it scrolls now.
  log.element.style.overflowY = "visible";
  const outer = scroller();
  mount.append(outer.element);
  outer.element.append(log.element);
  outer.element.dispatchEvent(new Event("scroll"));
  expect(tracker.current?.element).toBe(outer.element);
  outer.element.style.overflowY = "visible";
  window.dispatchEvent(new Event("resize"));
  expect(tracker.current?.element).toBeNull();
  stop();
  expect(tracker.current).toBeNull();
  outer.element.style.overflowY = "auto";
  resized(target);
  window.dispatchEvent(new Event("resize"));
  expect(tracker.current).toBeNull();
  // Explicit choices do not observe layout.
  const count = observers.length;
  const fixed = tracker.attach(target, "window");
  expect(tracker.current?.element).toBeNull();
  fixed();
  const named = tracker.attach(target, log.element);
  expect(tracker.current?.element).toBe(log.element);
  named();
  expect(observers.length).toBe(count);
  // An empty ref detects until it holds an element.
  const ref: { current: HTMLElement | null } = { current: null };
  const pending = tracker.attach(target, ref);
  expect(tracker.current?.element).toBe(outer.element);
  ref.current = log.element;
  resized(target);
  expect(tracker.current?.element).toBe(log.element);
  // A ref stays live: a remounted pane replaces the element it held.
  ref.current = outer.element;
  resized(target);
  expect(tracker.current?.element).toBe(outer.element);
  pending();
  // Documents without a window have nothing to track.
  const detached = document.implementation.createHTMLDocument();
  const orphan = detached.createElement("div");
  vi.spyOn(detached, "defaultView", "get").mockReturnValue(null);
  expect(tracker.attach(orphan, "auto")).toBeTypeOf("function");
  expect(tracker.rootFor(orphan)).toBeNull();
});

it("attaches the tracker after commit and skips frames whose host owns scrolling", async () => {
  const log = scroller();
  mount.append(log.element);
  const seen: Array<HTMLElement | null | undefined> = [];
  function Probe({ enabled }: { enabled: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    const tracker = useScrollRoot(ref, "auto", enabled);
    tracker.subscribe(() => seen.push(tracker.current?.element));
    return createElement("div", { ref });
  }
  const root = createRoot(log.element);
  await act(() => root.render(createElement(Probe, { enabled: false })));
  expect(seen).toEqual([]);
  await act(() => root.render(createElement(Probe, { enabled: true })));
  expect(seen).toContain(log.element);
  await act(() => root.unmount());
});

it("follows a scrollContainer ref whose pane mounts in the same commit", async () => {
  const page = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const scrolled: Element[] = [];
  vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(function (
    this: HTMLElement,
  ) {
    scrolled.push(this);
  });
  const firstFrame: Array<HTMLElement | null | undefined> = [];
  function Message({ pane }: { pane: RefObject<HTMLDivElement | null> }) {
    const ref = useRef<HTMLDivElement>(null);
    const tracker = useScrollRoot(ref, pane);
    useLayoutEffect(() => {
      // React attaches the pane's ref only after this effect runs.
      expect(pane.current).toBeNull();
      const follower = new ScrollFollower(
        ref.current!,
        () => ({ behavior: "instant", padding: 0 }),
        () => {},
        () => () => {},
        tracker,
      );
      follower.start();
      requestAnimationFrame(() => firstFrame.push(tracker.current?.element));
      return () => follower.dispose();
    }, [pane, tracker]);
    return createElement("div", { ref });
  }
  let pane!: RefObject<HTMLDivElement | null>;
  function Chat() {
    pane = useRef<HTMLDivElement>(null);
    // The pane does not overflow yet, so detection alone would pick the window.
    return createElement(
      "div",
      { ref: pane, style: { overflowY: "auto", height: "600px" } },
      createElement(Message, { pane }),
    );
  }
  const root = createRoot(mount);
  await act(() => root.render(createElement(Chat)));
  paint();
  expect(firstFrame).toEqual([pane.current]);
  expect(scrolled).toContain(pane.current);
  expect(page).not.toHaveBeenCalled();
  await act(() => root.unmount());
});

it("notices scrolling inside shadow roots, where scroll events stop", () => {
  // A chat shell custom element: its message list scrolls inside its shadow root.
  const shell = document.createElement("chat-shell");
  mount.append(shell);
  const shadow = shell.attachShadow({ mode: "open" });
  const list = scroller({ top: 100, height: 600, content: 400 });
  shadow.append(list.element);
  const target = document.createElement("div");
  list.element.append(target);
  box(target, 300, 5000);
  const outside = vi.fn();
  document.addEventListener("scroll", outside, { capture: true });
  const tracker = new ScrollRootTracker();
  const stop = tracker.attach(target, "auto");
  expect(tracker.current?.element).toBeNull();
  // Scrolling the list proves it scrolls, though the document never hears it.
  list.geometry.content = 3000;
  list.element.dispatchEvent(new Event("scroll"));
  expect(outside).not.toHaveBeenCalled();
  expect(tracker.current?.element).toBe(list.element);
  const viewport = new HostViewport(() => target, tracker);
  const listener = vi.fn();
  const unsubscribe = viewport.subscribe(listener);
  const frame = document.createElement("div") as unknown as HTMLIFrameElement;
  list.element.append(frame);
  frame.getBoundingClientRect = () => target.getBoundingClientRect();
  const post = vi.fn();
  const reporter = new FrameViewportReporter(frame, tracker, post);
  const [notified, posted] = [
    listener.mock.calls.length,
    post.mock.calls.length,
  ];
  box(target, -900, 5000);
  list.element.dispatchEvent(new Event("scroll"));
  expect(listener).toHaveBeenCalledTimes(notified + 1);
  expect(viewport.offset).toBe(1000);
  expect(post).toHaveBeenCalledTimes(posted + 1);
  expect(post).toHaveBeenLastCalledWith(
    expect.objectContaining({ offset: 1000, height: 600 }),
  );
  reporter.dispose();
  unsubscribe();
  stop();
  // A renderer slotted into the shell hears the shell's list through the slot.
  const slot = document.createElement("slot");
  list.element.append(slot);
  const slotted = document.createElement("div");
  shell.append(slotted);
  Object.defineProperty(slotted, "assignedSlot", { value: slot });
  box(slotted, 300, 5000);
  const slottedTracker = new ScrollRootTracker();
  const stopSlotted = slottedTracker.attach(slotted, "auto");
  const slottedViewport = new HostViewport(() => slotted, slottedTracker);
  const slottedListener = vi.fn();
  const unsubscribeSlotted = slottedViewport.subscribe(slottedListener);
  const before = slottedListener.mock.calls.length;
  box(slotted, -200, 5000);
  list.element.dispatchEvent(new Event("scroll"));
  expect(slottedListener).toHaveBeenCalledTimes(before + 1);
  unsubscribeSlotted();
  stopSlotted();
  // Cleanup removes the shadow root listeners too.
  list.element.dispatchEvent(new Event("scroll"));
  expect(slottedListener).toHaveBeenCalledTimes(before + 1);
  document.removeEventListener("scroll", outside, { capture: true });
});

it("reports a host renderer's visible area from its own top", () => {
  const log = scroller({ top: 100, height: 600 });
  const target = document.createElement("div");
  mount.append(log.element);
  log.element.append(target);
  box(target, 300, 5000);
  const tracker = new ScrollRootTracker();
  const empty = new HostViewport(() => null, tracker);
  expect([empty.offset, empty.height, empty.width, empty.origin()]).toEqual([
    0, 0, 0, 0,
  ]);
  empty.scrollTo(100);
  expect(empty.subscribe(() => {})).toBeTypeOf("function");
  const viewport = new HostViewport(() => target, tracker);
  // Before tracking starts, the window is the scroller.
  expect(viewport.offset).toBe(-300);
  expect(viewport.height).toBe(800);
  const stop = tracker.attach(target, "auto");
  expect(viewport.offset).toBe(-200);
  expect(viewport.height).toBe(600);
  expect(viewport.width).toBe(400);
  expect(viewport.origin()).toBe(300);
  const listener = vi.fn();
  const unsubscribe = viewport.subscribe(listener);
  expect(listener).toHaveBeenCalledTimes(1);
  // The scroller and the renderer are both observed for size changes.
  expect(observers.some((entry) => entry.targets.has(log.element))).toBe(true);
  box(target, -900, 5000);
  log.element.dispatchEvent(new Event("scroll"));
  expect(listener).toHaveBeenCalledTimes(2);
  expect(viewport.offset).toBe(1000);
  // Unchanged geometry and unrelated scrolling are ignored; resizes are not.
  log.element.dispatchEvent(new Event("scroll"));
  const other = document.createElement("div");
  mount.append(other);
  other.dispatchEvent(new Event("scroll", { bubbles: false }));
  expect(listener).toHaveBeenCalledTimes(2);
  resized(target);
  expect(listener).toHaveBeenCalledTimes(3);
  box(target, -950, 5000);
  window.dispatchEvent(new Event("resize"));
  expect(listener).toHaveBeenCalledTimes(4);
  viewport.scrollTo(1500);
  expect(log.scrollTo).toHaveBeenLastCalledWith({
    top: 0 - 950 + 1500 - 100,
    behavior: "instant",
  });
  // A new scroller moves the size observation.
  log.element.style.overflowY = "visible";
  resized(target);
  expect(observers.some((entry) => entry.targets.has(log.element))).toBe(false);
  const second = vi.fn();
  const unsubscribeSecond = viewport.subscribe(second);
  unsubscribe();
  document.dispatchEvent(new Event("scroll"));
  unsubscribeSecond();
  stop();
  const calls = second.mock.calls.length;
  window.dispatchEvent(new Event("resize"));
  expect(second).toHaveBeenCalledTimes(calls);
});

it("follows inside a scroll container and pauses only for reading there", () => {
  const log = scroller({ top: 100, height: 600, content: 3000 });
  const target = document.createElement("div");
  const sidebar = document.createElement("nav");
  mount.append(log.element, sidebar);
  log.element.append(target);
  let bottom = 1500;
  target.getBoundingClientRect = () =>
    new DOMRect(0, bottom - 1400 - log.element.scrollTop, 400, 1400);
  const tracker = new ScrollRootTracker();
  const stop = tracker.attach(target, "auto");
  const changed = vi.fn();
  const follower = new ScrollFollower(
    target,
    () => ({ behavior: "instant", padding: 24 }),
    changed,
    listenForScrollAway,
    tracker,
  );
  follower.start();
  expect(changed).toHaveBeenLastCalledWith(true);
  expect(log.element.style.overflowAnchor).toBe("none");
  expect(document.documentElement.style.overflowAnchor).not.toBe("none");
  paint();
  // The tail sits 24px above the list's bottom edge.
  expect(log.scrollTo).toHaveBeenLastCalledWith({
    top: 1500 - 700 + 24,
    behavior: "instant",
  });
  bottom = 2200;
  resized(log.element);
  paint();
  expect(log.element.scrollTop).toBe(2200 - 700 + 24);
  // Reading elsewhere on the page leaves following alone.
  sidebar.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
  const button = document.createElement("button");
  sidebar.append(button);
  button.dispatchEvent(
    new KeyboardEvent("keydown", { key: "PageUp", bubbles: true }),
  );
  sidebar.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, button: 1 }),
  );
  const touch = (element: Element, type: string, y: number) => {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, "touches", {
      value: [{ clientX: 0, clientY: y }],
    });
    element.dispatchEvent(event);
  };
  touch(sidebar, "touchstart", 10);
  touch(sidebar, "touchmove", 40);
  expect(changed).toHaveBeenLastCalledWith(true);
  // Keys on an unfocused page scroll the last used scroller.
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", { key: "PageUp", bubbles: true }),
  );
  expect(changed).toHaveBeenLastCalledWith(false);
  expect(log.element.style.overflowAnchor).not.toBe("none");
  follower.resume();
  touch(target, "touchstart", 10);
  touch(target, "touchmove", 40);
  expect(changed).toHaveBeenLastCalledWith(false);
  follower.resume();
  log.element.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, clientX: 392 }),
  );
  expect(changed).toHaveBeenLastCalledWith(false);
  follower.resume();
  target.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
  expect(changed).toHaveBeenLastCalledWith(false);
  // A new scroller takes over anchoring while following continues.
  follower.resume();
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  log.element.style.overflowY = "visible";
  resized(target);
  expect(log.element.style.overflowAnchor).not.toBe("none");
  expect(document.documentElement.style.overflowAnchor).toBe("none");
  paint();
  expect(scrollTo).toHaveBeenCalled();
  follower.dispose();
  expect(document.documentElement.style.overflowAnchor).not.toBe("none");
  stop();
});

it("reports a frame's visible part of a scroll container and scrolls it on request", () => {
  const log = scroller({ top: 100, height: 600 });
  // Only the frame element's geometry matters; happy-dom cannot load frames.
  const frame = document.createElement("div") as unknown as HTMLIFrameElement;
  mount.append(log.element);
  log.element.append(frame);
  let top = 400;
  frame.getBoundingClientRect = () => new DOMRect(0, top, 500, 2000);
  const tracker = new ScrollRootTracker();
  const stop = tracker.attach(frame, "auto");
  const post = vi.fn();
  const reporter = new FrameViewportReporter(frame, tracker, post);
  expect(post).toHaveBeenLastCalledWith({
    type: "viewport",
    revision: 1,
    offset: 0,
    height: 300,
    width: 500,
  });
  top = -500;
  log.element.dispatchEvent(new Event("scroll"));
  expect(post).toHaveBeenLastCalledWith({
    type: "viewport",
    revision: 2,
    offset: 600,
    height: 600,
    width: 500,
  });
  // Scrolling unrelated content does not report.
  const other = document.createElement("div");
  mount.append(other);
  other.dispatchEvent(new Event("scroll"));
  expect(post).toHaveBeenCalledTimes(2);
  log.element.scrollTop = 900;
  reporter.scroll(700, 2);
  expect(log.scrollTo).toHaveBeenLastCalledWith({
    top: 900 - 500 - 100 + 700,
    behavior: "instant",
  });
  // Stale or overtaken requests are ignored.
  reporter.scroll(800, 1);
  top = -560;
  reporter.scroll(800, 2);
  expect(log.scrollTo).toHaveBeenCalledTimes(1);
  top = 900;
  window.dispatchEvent(new Event("resize"));
  reporter.scroll(10, 3);
  expect(log.scrollTo).toHaveBeenCalledTimes(1);
  // Switching scrollers reports again and observes the new one.
  const reported = post.mock.calls.length;
  log.element.style.overflowY = "visible";
  resized(frame);
  expect(tracker.current?.element).toBeNull();
  expect(post.mock.calls.length).toBeGreaterThan(reported);
  expect(observers.some((entry) => entry.targets.has(log.element))).toBe(false);
  reporter.dispose();
  const final = post.mock.calls.length;
  window.dispatchEvent(new Event("resize"));
  document.dispatchEvent(new Event("scroll"));
  expect(post).toHaveBeenCalledTimes(final);
  stop();
});
