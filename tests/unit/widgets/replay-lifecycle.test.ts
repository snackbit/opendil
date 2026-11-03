// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useReplay } from "../../../apps/demo/src/playback/use-replay";
import { tokenOffsets } from "../../../apps/demo/src/playback/token-index";
const workers: Transport[] = [],
  frames = new Map<number, FrameRequestCallback>();
let now = 0,
  next = 0,
  hidden = false;
class Transport {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  source = "";
  terminated = false;
  constructor() {
    workers.push(this);
  }
  postMessage(source: string) {
    this.source = source;
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: unknown = { offsets: tokenOffsets(this.source) }) {
    this.onmessage?.({ data });
  }
}
let mount: HTMLDivElement, root: ReturnType<typeof createRoot>;
const source = "word ".repeat(300);
function Probe({
  text = source,
  dataset = "showcase",
}: {
  text?: string;
  dataset?: string;
}) {
  const replay = useReplay(text, dataset);
  function fast() {
    replay.setTokensPerSecond(1000);
  }
  function profile() {
    replay.setStressSpeed("4");
  }
  function reset() {
    replay.reset(text.length);
  }
  return createElement(
    "div",
    null,
    createElement("pre", null, text.slice(0, replay.offset)),
    createElement(
      "span",
      { role: "status" },
      replay.preparing
        ? "Preparing"
        : replay.complete
          ? "Complete"
          : "Streaming",
    ),
    createElement("span", { role: "alert" }, replay.error),
    createElement("button", { onClick: replay.replay }, "Replay"),
    createElement("button", { onClick: replay.pause }, "Pause"),
    createElement("button", { onClick: replay.finish }, "Finish"),
    createElement("button", { onClick: fast }, "Fast"),
    createElement("button", { onClick: profile }, "Profile"),
    createElement("button", { onClick: reset }, "Reset"),
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("Worker", Transport);
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++next, callback);
    return next;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  history.replaceState(null, "", "/");
  now = 0;
  hidden = false;
  mount = document.createElement("div");
  document.body.append(mount);
  root = createRoot(mount);
});
afterEach(async () => {
  await act(() => root.unmount());
  mount.remove();
  workers.splice(0);
  frames.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function click(label: string) {
  await act(() =>
    [...mount.querySelectorAll("button")]
      .find((button) => button.textContent === label)
      ?.click(),
  );
}
async function paint(elapsed: number) {
  now += elapsed;
  await act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(now));
  });
}
const text = () => mount.querySelector("pre")?.textContent;
it("keeps content during preparation, pauses without catch-up, and replays a cached index", async () => {
  await act(() => root.render(createElement(Probe)));
  await click("Replay");
  expect(text()).toBe(source);
  expect(mount.querySelector('[role="status"]')?.textContent).toBe("Preparing");
  await act(() => workers[0]?.reply());
  expect(workers[0]?.terminated).toBe(true);
  expect(text()).toBe("");
  await paint(100);
  expect(text()).toBe("word ".repeat(15).trimEnd());
  await click("Pause");
  await paint(10000);
  expect(text()).toBe("word ".repeat(15).trimEnd());
  await click("Fast");
  await click("Pause");
  await paint(1);
  expect(text()).toBe("word ".repeat(16).trimEnd());
  hidden = true;
  await act(() => document.dispatchEvent(new Event("visibilitychange")));
  await paint(10000);
  const paused = text();
  hidden = false;
  await act(() => document.dispatchEvent(new Event("visibilitychange")));
  await paint(0);
  expect(text()).toBe(paused);
  await paint(1000);
  expect(text()).toBe(source);
  await click("Replay");
  expect(workers).toHaveLength(1);
  expect(text()).toBe("");
  await click("Finish");
  expect(text()).toBe(source);
  await click("Reset");
  await click("Replay");
  expect(workers).toHaveLength(2);
});
it("ignores cancelled and malformed results and leaves usable content on worker failure", async () => {
  await act(() => root.render(createElement(Probe)));
  await click("Replay");
  const cancelled = workers[0];
  await click("Finish");
  await act(() => cancelled?.reply());
  expect(text()).toBe(source);
  await click("Replay");
  await act(() => workers[1]?.reply({ error: "Invalid source" }));
  expect(text()).toBe(source);
  expect(mount.querySelector('[role="alert"]')?.textContent).toContain(
    "Could not prepare",
  );
  await click("Replay");
  await act(() => workers[2]?.onerror?.());
  expect(text()).toBe(source);
  await click("Replay");
  const abandoned = workers[3];
  await click("Reset");
  await act(() => abandoned?.onerror?.());
  expect(text()).toBe(source);
  await click("Replay");
  await act(() => workers[4]?.reply(null));
  expect(text()).toBe(source);
});
it("uses explicitly selected character stress profiles and skips hidden time", async () => {
  history.replaceState(null, "", "/?benchmark=1");
  const large = "x".repeat(50000);
  await act(() =>
    root.render(createElement(Probe, { text: large, dataset: "large" })),
  );
  await click("Replay");
  expect(workers).toHaveLength(0);
  await act(() => vi.advanceTimersByTime(33));
  expect(text()?.length).toBe(4096);
  await click("Profile");
  await act(() => vi.advanceTimersByTime(33));
  expect(text()?.length).toBe(20480);
  hidden = true;
  await act(() => vi.advanceTimersByTime(33));
  expect(text()?.length).toBe(20480);
  hidden = false;
  await act(() => vi.advanceTimersByTime(100));
  expect(text()).toBe(large);
  await click("Finish");
  expect(text()).toBe(large);
});
