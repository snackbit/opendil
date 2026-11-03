// @vitest-environment happy-dom
import { act, createElement, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  listenForScrollAway,
  useStreamFollow,
} from "../../../packages/opendil/src/dil/view/stream-follow";
import type { AutoScroll } from "../../../packages/opendil/src/dil/view/scroll-options";
import { scrollSettings } from "../../../packages/opendil/src/dil/view/scroll-options";
import { ScrollFollower } from "../../../packages/opendil/src/dil/view/scroll/controller";
const frames = new Map<number, FrameRequestCallback>();
const resizes: Array<() => void> = [];
let next = 0,
  bottom = 900,
  top = 0;
let viewportY = 0,
  frameTime = 0;
let mount: HTMLDivElement;
let reactRoot: ReturnType<typeof createRoot>;
let unlisten = () => {};
const changed = vi.fn();
const scrollTo = vi.fn((options?: ScrollToOptions | number, y?: number) => {
  viewportY = Math.round(
    typeof options === "object" ? (options.top ?? viewportY) : (y ?? viewportY),
  );
});
function Probe({
  enabled = true,
  streaming = true,
  present = true,
  silent = false,
}: {
  enabled?: AutoScroll;
  streaming?: boolean;
  present?: boolean;
  silent?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { pause, resume } = useStreamFollow(
    ref,
    enabled,
    streaming,
    silent ? undefined : changed,
  );
  return present
    ? createElement(
        "div",
        { ref },
        createElement("button", { onClick: pause }, "Pause follow"),
        createElement("button", { onClick: resume }, "Resume follow"),
      )
    : null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++next, callback);
    return next;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resizes.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(window, "scrollTo").mockImplementation(scrollTo);
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => viewportY);
  vi.spyOn(performance, "now").mockImplementation(() => frameTime);
  vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(
    4000,
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => new DOMRect(0, top - viewportY, 1000, bottom - top),
  );
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(
    1000,
  );
  vi.stubGlobal("innerHeight", 900);
  mount = document.createElement("div");
  document.body.append(mount);
  reactRoot = createRoot(mount);
  changed.mockClear();
  scrollTo.mockClear();
  bottom = 900;
  top = 0;
  viewportY = 0;
  frameTime = 0;
});
afterEach(async () => {
  await act(() => reactRoot.unmount());
  mount.remove();
  unlisten();
  unlisten = () => {};
  frames.clear();
  resizes.splice(0);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function paint() {
  frameTime += 16;
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(frameTime));
}
it("follows growing content without treating programmatic scrolling as reading", async () => {
  await act(() => reactRoot.render(createElement(Probe)));
  expect(changed).toHaveBeenLastCalledWith(true);
  paint();
  expect(scrollTo).toHaveBeenCalledTimes(1);
  bottom = 1600;
  window.dispatchEvent(new Event("scroll"));
  resizes[0]?.();
  resizes[0]?.();
  paint();
  expect(changed).not.toHaveBeenCalledWith(false);
  expect(scrollTo).toHaveBeenCalledTimes(2);
  window.dispatchEvent(new WheelEvent("wheel", { deltaY: -400 }));
  expect(changed).toHaveBeenLastCalledWith(false);
  const events = changed.mock.calls.length;
  window.dispatchEvent(new WheelEvent("wheel", { deltaY: 0.1 }));
  expect(changed).toHaveBeenCalledTimes(events);
  resizes[0]?.();
  paint();
  expect(scrollTo).toHaveBeenCalledTimes(2);
  bottom = 900;
  window.dispatchEvent(new Event("scroll"));
  expect(changed).toHaveBeenLastCalledWith(false);
  await act(() => mount.querySelectorAll("button")[1]?.click());
  expect(changed).toHaveBeenLastCalledWith(true);
  resizes[0]?.();
  paint();
  expect(scrollTo).toHaveBeenCalledTimes(3);
  top = 1100;
  bottom = 2000;
  window.dispatchEvent(new WheelEvent("wheel", { deltaY: -10 }));
  expect(changed).toHaveBeenLastCalledWith(false);
});
it("supports explicit pauses, disabled mode, completed streams, and absent roots", async () => {
  await act(() => reactRoot.render(createElement(Probe)));
  await act(() => mount.querySelector("button")?.click());
  expect(changed).toHaveBeenLastCalledWith(false);
  await act(() => reactRoot.render(createElement(Probe, { enabled: false })));
  expect(changed).toHaveBeenLastCalledWith(false);
  await act(() => reactRoot.render(createElement(Probe, { streaming: false })));
  await act(() => reactRoot.render(createElement(Probe, { present: false })));
  expect(frames.size).toBe(0);
});
it("releases on any manual scroll gesture while leaving editing keys alone", () => {
  const pause = vi.fn();
  unlisten = listenForScrollAway(window, pause);
  window.dispatchEvent(new WheelEvent("wheel", { deltaY: 10 }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "A" }));
  window.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100 }));
  expect(pause).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: " ", shiftKey: true }),
  );
  window.dispatchEvent(new PointerEvent("pointerdown", { clientX: 1000 }));
  window.dispatchEvent(new PointerEvent("pointerdown", { button: 1 }));
  const input = document.createElement("input");
  mount.append(input);
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
  );
  const prevented = new KeyboardEvent("keydown", {
    key: "PageUp",
    cancelable: true,
  });
  prevented.preventDefault();
  window.dispatchEvent(prevented);
  expect(pause).toHaveBeenCalledTimes(5);
  const anchor = document.createElement("a");
  anchor.href = "#top";
  mount.append(anchor);
  anchor.dispatchEvent(
    new PointerEvent("pointerdown", { clientX: 100, bubbles: true }),
  );
  const touch = (type: string, y?: number) => {
    const event = new Event(type);
    Object.defineProperty(event, "touches", {
      value: y === undefined ? [] : [{ clientY: y }],
    });
    window.dispatchEvent(event);
  };
  touch("touchstart");
  touch("touchmove", 5);
  touch("touchstart", 100);
  touch("touchmove", 80);
  touch("touchmove", 120);
  touch("touchmove");
  expect(pause).toHaveBeenCalledTimes(8);
  const button = document.createElement("button");
  mount.append(button);
  button.dispatchEvent(
    new KeyboardEvent("keydown", { key: " ", bubbles: true }),
  );
  expect(pause).toHaveBeenCalledTimes(8);
  const startX = new Event("touchstart"),
    moveX = new Event("touchmove");
  Object.defineProperty(startX, "touches", {
    value: [{ clientX: 0, clientY: 0 }],
  });
  Object.defineProperty(moveX, "touches", {
    value: [{ clientX: 20, clientY: 0 }],
  });
  window.dispatchEvent(startX);
  window.dispatchEvent(moveX);
  expect(pause).toHaveBeenCalledTimes(9);
});
it("supports following without a notification callback", async () => {
  await act(() =>
    reactRoot.render(createElement(Probe, { enabled: false, silent: true })),
  );
  await act(() =>
    reactRoot.render(createElement(Probe, { enabled: true, silent: true })),
  );
  window.dispatchEvent(new WheelEvent("wheel", { deltaY: 1 }));
  await act(() => mount.querySelectorAll("button")[1]?.click());
  paint();
  expect(scrollTo).toHaveBeenCalled();
});
it("supports smooth following, available scroll-ahead space, immediate cancellation and live settings", async () => {
  bottom = 1200;
  await act(() =>
    reactRoot.render(
      createElement(Probe, { enabled: { behavior: "smooth", padding: 32 } }),
    ),
  );
  paint();
  expect(viewportY).toBeGreaterThan(0);
  expect(viewportY).toBeLessThan(332);
  expect(scrollTo).toHaveBeenLastCalledWith({
    top: expect.any(Number),
    behavior: "instant",
  });
  resizes[0]?.();
  paint();
  expect(scrollTo).toHaveBeenCalledTimes(2);
  const pausedAt = viewportY;
  window.dispatchEvent(new WheelEvent("wheel", { deltaY: 1 }));
  paint();
  expect(viewportY).toBe(pausedAt);
  expect(frames.size).toBe(0);
  await act(() =>
    reactRoot.render(
      createElement(Probe, { enabled: { behavior: "instant", padding: 64 } }),
    ),
  );
  paint();
  expect(changed).toHaveBeenLastCalledWith(false);
  await act(() => mount.querySelectorAll("button")[1]?.click());
  paint();
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 364, behavior: "instant" });
  bottom = 5000;
  resizes[0]?.();
  paint();
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 3100, behavior: "instant" });
});
it("validates scroll options and respects reduced motion and shadow editing gestures", async () => {
  expect(scrollSettings(true)).toEqual({ behavior: "instant", padding: 0 });
  expect(scrollSettings({})).toEqual({ behavior: "instant", padding: 0 });
  expect(scrollSettings(false)).toBeNull();
  for (const padding of [-1, NaN, Infinity])
    expect(() => scrollSettings({ padding })).toThrow("padding");
  // Runtime boundary: JS consumers can bypass the TypeScript union.
  expect(() => scrollSettings(JSON.parse('{"behavior":"slow"}'))).toThrow(
    "behavior",
  );
  const media = Object.assign(new EventTarget(), { matches: true });
  vi.spyOn(window, "matchMedia").mockReturnValue(
    Object.assign(media, {
      media: "",
      onchange: null,
      addListener() {},
      removeListener() {},
    }),
  );
  bottom = 1200;
  await act(() =>
    reactRoot.render(
      createElement(Probe, { enabled: { behavior: "smooth", padding: 32 } }),
    ),
  );
  paint();
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 332, behavior: "instant" });
  media.dispatchEvent(new Event("change"));
  paint();
  const host = document.createElement("div");
  mount.append(host);
  const shadow = host.attachShadow({ mode: "open" }),
    input = document.createElement("input");
  shadow.append(input);
  input.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Home",
      composed: true,
      bubbles: true,
    }),
  );
  expect(changed).toHaveBeenLastCalledWith(true);
  window.dispatchEvent(new WheelEvent("wheel", { deltaY: 1 }));
  expect(changed).toHaveBeenLastCalledWith(false);
});
it("settles without spinning and follows late layout until the reader pauses", async () => {
  bottom = 1200;
  await act(() =>
    reactRoot.render(
      createElement(Probe, { enabled: { behavior: "smooth", padding: 32 } }),
    ),
  );
  let previous = 0;
  for (let index = 0; index < 40; index++) {
    bottom += 12;
    resizes[0]?.();
    paint();
    expect(viewportY).toBeGreaterThanOrEqual(previous);
    expect(bottom - 900 + 32 - viewportY).toBeLessThan(340);
    previous = viewportY;
  }
  await act(() =>
    reactRoot.render(
      createElement(Probe, {
        enabled: { behavior: "smooth", padding: 32 },
        streaming: false,
      }),
    ),
  );
  for (let index = 0; index < 80 && frames.size; index++) paint();
  expect(viewportY).toBe(bottom - 900 + 32);
  expect(frames.size).toBe(0);
  expect(changed).toHaveBeenLastCalledWith(true);
  expect(document.documentElement.style.overflowAnchor).toBe("none");
  bottom += 180;
  resizes[0]?.();
  for (let index = 0; index < 80 && frames.size; index++) paint();
  expect(viewportY).toBe(bottom - 900 + 32);
  expect(frames.size).toBe(0);
  window.dispatchEvent(new WheelEvent("wheel", { deltaY: -1 }));
  expect(changed).toHaveBeenLastCalledWith(false);
  expect(document.documentElement.style.overflowAnchor).not.toBe("none");
  const pausedAt = viewportY;
  bottom += 100;
  resizes[0]?.();
  paint();
  expect(viewportY).toBe(pausedAt);
});
it("shares anchoring ownership and stops abandoned or disabled targets", () => {
  const first = document.createElement("div"),
    second = document.createElement("div");
  mount.append(first, second);
  let settings: ReturnType<typeof scrollSettings> = {
    behavior: "smooth",
    padding: 0,
  };
  const a = new ScrollFollower(
    first,
    () => settings,
    changed,
    () => () => {},
  );
  const b = new ScrollFollower(
    second,
    () => settings,
    changed,
    () => () => {},
  );
  a.start();
  b.start();
  expect(document.documentElement.style.overflowAnchor).toBe("none");
  a.pause();
  expect(document.documentElement.style.overflowAnchor).toBe("none");
  settings = null;
  paint();
  expect(document.documentElement.style.overflowAnchor).not.toBe("none");
  settings = { behavior: "smooth", padding: 0 };
  b.start();
  second.remove();
  paint();
  b.resume();
  expect(frames.size).toBe(0);
  a.dispose();
  b.dispose();
  const detached = document.implementation.createHTMLDocument();
  vi.spyOn(detached, "defaultView", "get").mockReturnValue(null);
  expect(
    () =>
      new ScrollFollower(
        detached.createElement("div"),
        () => settings,
        changed,
        () => () => {},
      ),
  ).toThrow("browser document");
});
