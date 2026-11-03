// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createStore } from "zustand/vanilla";
import { afterEach, expect, it, vi } from "vitest";
import { ActionReceipt } from "../../../packages/opendil/src/dil/runtime/action-receipt";
import type { DocumentStatus } from "../../../packages/opendil/src/dil/runtime/document";
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
    revision: 0,
    scanned: 0,
    error: "",
    clipboard: null,
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
