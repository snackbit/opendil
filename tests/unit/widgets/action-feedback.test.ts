// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createStore } from "zustand/vanilla";
import { afterEach, expect, it, vi } from "vitest";
import { ActionReceipt } from "../../../packages/opendil/src/dil/runtime/action-receipt";
import type { DocumentStatus } from "../../../packages/opendil/src/dil/runtime/document";
import { writeClipboard } from "../../../packages/opendil/src/dil/renderer-environment";
import {
  useActionFeedback,
  type ActionFeedback,
} from "../../../packages/opendil/src/dil/widgets/action-feedback";
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  vi.useRealTimers();
});
function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const status = createStore<DocumentStatus>(() => ({
    complete: true,
    incomplete: false,
    revision: 0,
    scanned: 0,
    error: null,
    ending: null,
    clipboard: null,
    actions: 0,
  }));
  const seen: { feedback: ActionFeedback; track: (result: unknown) => void }[] =
    [];
  function Probe() {
    const [feedback, track] = useActionFeedback(status);
    seen.push({ feedback, track });
    return null;
  }
  root = createRoot(document.createElement("div"));
  act(() => root?.render(createElement(Probe)));
  const latest = () => seen.at(-1)!;
  return { status, latest };
}
it("shows the clipboard outcome only for the action this control started", () => {
  vi.useFakeTimers();
  const { status, latest } = mount();
  act(() => latest().track(new ActionReceipt(4)));
  act(() => status.setState({ clipboard: { intent: 3, ok: true } }));
  expect(latest().feedback).toBe("idle");
  act(() => status.setState({ clipboard: { intent: 4, ok: true } }));
  expect(latest().feedback).toBe("copied");
  act(() => vi.advanceTimersByTime(1999));
  expect(latest().feedback).toBe("copied");
  act(() => vi.advanceTimersByTime(1));
  expect(latest().feedback).toBe("idle");
});
it("reports a failed copy and ignores actions without a receipt", () => {
  const { status, latest } = mount();
  act(() => latest().track(undefined));
  act(() => status.setState({ clipboard: { intent: 0, ok: false } }));
  expect(latest().feedback).toBe("idle");
  act(() => latest().track(new ActionReceipt(7)));
  act(() => status.setState({ clipboard: { intent: 7, ok: false } }));
  expect(latest().feedback).toBe("failed");
});
it("turns every clipboard write into an outcome instead of an exception", async () => {
  const clipboard = (writeText: (text: string) => Promise<void>) =>
    vi.spyOn(navigator, "clipboard", "get").mockReturnValue({
      writeText,
    } as unknown as Clipboard);
  try {
    // Insecure contexts, such as a plain-HTTP LAN host, have no Clipboard API.
    vi.spyOn(navigator, "clipboard", "get").mockReturnValue(
      undefined as unknown as Clipboard,
    );
    await expect(writeClipboard("a")).resolves.toBe(false);
    const write = vi.fn(() => Promise.resolve());
    clipboard(write);
    await expect(writeClipboard("b")).resolves.toBe(true);
    expect(write).toHaveBeenCalledWith("b");
    clipboard(() => Promise.reject(new DOMException("Denied")));
    await expect(writeClipboard("c")).resolves.toBe(false);
    clipboard(() => {
      throw new TypeError("Illegal invocation");
    });
    await expect(writeClipboard("d")).resolves.toBe(false);
  } finally {
    vi.restoreAllMocks();
  }
});
