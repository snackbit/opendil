// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FrameOverlayRoom } from "../../packages/opendil/src/dil/isolation/overlay-room";
import {
  OverlayRoomContext,
  useCollisionPadding,
  type CollisionPadding,
  type OverlayRoom,
} from "../../packages/opendil/src/components/ui/overlays/ui-scope";

beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(() => vi.unstubAllGlobals());

it("lets overlays use the host's visible area below a short frame", () => {
  let visibleBottom = 700;
  let frameHeight = 105;
  const room = new FrameOverlayRoom(
    () => visibleBottom,
    () => frameHeight,
  );
  const changes = vi.fn();
  const unsubscribe = room.subscribe(changes);
  expect(room.below()).toBe(0);
  room.update();
  expect(room.below()).toBe(595);
  // The frame grew to show the overlay; the room shrinks with it.
  frameHeight = 300;
  room.update();
  expect(room.below()).toBe(400);
  room.update();
  expect(changes).toHaveBeenCalledTimes(2);
  // A long frame whose bottom is below the scroller leaves no extra room.
  frameHeight = 2000;
  room.update();
  expect(room.below()).toBe(0);
  unsubscribe();
  visibleBottom = 2500;
  room.update();
  expect(changes).toHaveBeenCalledTimes(3);
});

it("lets overlays extend any distance once one is clipped at the frame's top, until all close", () => {
  // A short frame at the bottom of the scroller: no visible room below it.
  const room = new FrameOverlayRoom(
    () => 105,
    () => 105,
  );
  room.update();
  expect(room.below()).toBe(0);
  room.track([{ top: 20 }]);
  expect(room.below()).toBe(0);
  // The popover flipped above its trigger and lost its top.
  room.track([{ top: -26 }]);
  const unbounded = room.below();
  expect(unbounded).toBeGreaterThan(10_000);
  // Placed below the trigger again, it keeps the room while open.
  room.track([{ top: 70 }]);
  room.update();
  expect(room.below()).toBe(unbounded);
  room.track([]);
  expect(room.below()).toBe(0);
});

it("extends an overlay's collision padding downward by the room below", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const seen: CollisionPadding[] = [];
  function Probe({ padding }: { padding?: CollisionPadding }) {
    seen.push(useCollisionPadding(padding));
    return null;
  }
  let below = 0;
  const listeners = new Set<() => void>();
  const room: OverlayRoom = {
    below: () => below,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  try {
    // Outside the iframe runtime, padding is unchanged.
    await act(() => root.render(createElement(Probe, { padding: 8 })));
    expect(seen.at(-1)).toBe(8);
    const framed = (padding?: CollisionPadding) =>
      createElement(
        OverlayRoomContext.Provider,
        { value: room },
        createElement(Probe, padding === undefined ? {} : { padding }),
      );
    await act(() => root.render(framed(8)));
    expect(seen.at(-1)).toBe(8);
    below = 300;
    await act(() => listeners.forEach((listener) => listener()));
    expect(seen.at(-1)).toEqual({ top: 8, right: 8, bottom: -292, left: 8 });
    await act(() => root.render(framed({ top: 4 })));
    expect(seen.at(-1)).toEqual({ top: 4, bottom: -300 });
    await act(() => root.render(framed()));
    expect(seen.at(-1)).toEqual({ top: 0, right: 0, bottom: -300, left: 0 });
  } finally {
    await act(() => root.unmount());
  }
});
