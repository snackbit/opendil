import { afterEach, expect, it, vi } from "vitest";
import { viewportScroller } from "../../packages/opendil/src/dil/isolation/viewport-scroll";
afterEach(() => vi.unstubAllGlobals());
it("coalesces virtualizer corrections to the latest offset after layout and ignores stale reading positions", () => {
  let paint: FrameRequestCallback = () => {};
  const request = vi.fn((callback: FrameRequestCallback) => {
    paint = callback;
    return 1;
  });
  const cancel = vi.fn();
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  const viewport = {
    offset: 100,
    revision: 1,
    height: 900,
    width: 1200,
    listeners: new Set<() => void>(),
  };
  const send = vi.fn(),
    scroller = viewportScroller(viewport, send);
  scroller.scroll(110);
  scroller.scroll(130);
  scroller.scroll(160);
  expect(request).toHaveBeenCalledTimes(1);
  paint(16);
  expect(send).toHaveBeenLastCalledWith(160, 1);
  scroller.scroll(170);
  viewport.revision++;
  paint(32);
  expect(send).toHaveBeenCalledTimes(1);
  scroller.scroll(200);
  scroller.dispose();
  paint(48);
  expect(send).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalled();
});
