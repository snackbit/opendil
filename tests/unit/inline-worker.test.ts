// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  POLICY_BLOCKED_MESSAGE,
  WASM_BLOCKED_MESSAGE,
  startInlineWorker,
} from "../../packages/opendil/src/dil/runtime/inline-worker";
import { ExpressionEngine } from "../../packages/opendil/src/dil/runtime/expressions";
import { MessageRenderer } from "../../packages/opendil/src/dil/message-renderer";

/** Mirrors how Chromium reports a blob: worker refused by the page policy. */
function violation(directive = "worker-src", blockedURI = "blob") {
  const event = new Event("securitypolicyviolation", { bubbles: true });
  Object.assign(event, { effectiveDirective: directive, blockedURI });
  document.dispatchEvent(event);
}
type Behavior =
  | "policy"
  | "policy-late"
  | "throws"
  | "throws-other"
  | "trusted-types"
  | "running";
let behavior: Behavior = "running";
const workers: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event?: Event) => void) | null = null;
  terminated = false;
  posted: unknown[] = [];
  constructor(readonly url: unknown) {
    if (behavior === "throws")
      throw new DOMException("Refused to create a worker", "SecurityError");
    if (behavior === "throws-other") throw new Error("Out of workers");
    // Chromium under require-trusted-types-for 'script'.
    if (behavior === "trusted-types" && typeof url === "string")
      throw new TypeError(
        "This document requires 'TrustedScriptURL' assignment.",
      );
    workers.push(this);
    if (behavior === "policy")
      setTimeout(() => {
        violation();
        this.onerror?.(new Event("error"));
      });
    if (behavior === "policy-late")
      setTimeout(() => {
        this.onerror?.(new Event("error"));
        violation("script-src", "blob:https://app.test/1");
      });
  }
  postMessage(message: unknown) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  /** Simulates an exception thrown by the worker script after it loaded. */
  crash() {
    this.onerror?.(Object.assign(new Event("error"), { message: "Boom" }));
  }
}
let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  behavior = "running";
  workers.length = 0;
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("__DIL_VM_WORKER__", "");
  vi.stubGlobal("__DIL_PARSER_WORKER__", "");
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function start(role: string) {
  const stops: string[] = [];
  const received: unknown[] = [];
  const handle = startInlineWorker("", {
    role,
    crashMessage: "Crashed.",
    onMessage: (data) => received.push(data),
    onStop: (message) => stops.push(message),
  });
  return { handle, stops, received };
}
it("explains a worker blocked by the page policy once per diagnosis", async () => {
  behavior = "policy";
  const first = start("policy test");
  const second = start("policy test");
  await vi.waitFor(() => expect(second.stops).toHaveLength(1));
  expect(first.stops).toEqual([POLICY_BLOCKED_MESSAGE]);
  expect(second.stops).toEqual([POLICY_BLOCKED_MESSAGE]);
  expect(errors).toHaveBeenCalledTimes(1);
  const diagnostic = String(errors.mock.calls[0]?.[0]);
  expect(diagnostic).toContain("blocked the policy test worker");
  expect(diagnostic).toContain('"worker-src blob:"');
  expect(diagnostic).toContain("'wasm-unsafe-eval'");
});
it("waits for a policy report dispatched after the worker error", async () => {
  behavior = "policy-late";
  const { stops } = start("late report");
  await vi.waitFor(() => expect(stops).toEqual([POLICY_BLOCKED_MESSAGE]));
  expect(String(errors.mock.calls[0]?.[0])).toContain("late report");
});
it("reports a refused constructor after the owner can listen", async () => {
  behavior = "throws";
  const { handle, stops } = start("constructor");
  expect(handle.worker).toBeNull();
  expect(stops).toEqual([]);
  await Promise.resolve();
  expect(stops).toEqual([POLICY_BLOCKED_MESSAGE]);
  handle.dispose();
});
it("keeps the crash message for failures the policy does not explain", async () => {
  const loaded = start("crash");
  workers[0]?.crash();
  expect(loaded.stops).toEqual(["Crashed."]);
  const unloaded = start("unloaded");
  workers[1]?.onerror?.(new Event("error"));
  // Unrelated policy reports must not be attributed to this worker.
  violation("img-src", "https://images.test/a.png");
  violation("worker-src", "https://cdn.test/worker.js");
  await vi.waitFor(() => expect(unloaded.stops).toEqual(["Crashed."]));
  expect(errors).not.toHaveBeenCalled();
});
it("treats a failure after the first reply as a crash, even with a later policy report", () => {
  const running = start("running");
  workers[0]?.onmessage?.({ data: "batch" });
  expect(running.received).toEqual(["batch"]);
  // A started worker no longer listens for blob: reports from elsewhere on the page.
  violation();
  workers[0]?.onerror?.(new Event("error"));
  expect(running.stops).toEqual(["Crashed."]);
  expect(errors).not.toHaveBeenCalled();
});
it("stays silent after disposal", async () => {
  behavior = "policy";
  const { handle, stops } = start("disposed");
  handle.dispose();
  expect(workers[0]?.terminated).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(stops).toEqual([]);
  expect(errors).not.toHaveBeenCalled();
});
it("keeps the crash message for script errors, even after a blob: policy report", () => {
  const { stops } = start("script error");
  violation();
  workers[0]?.crash();
  expect(stops).toEqual(["Crashed."]);
  expect(errors).not.toHaveBeenCalled();
});
it("stops listening for policy reports once the load window has passed", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    const { stops } = start("quiet");
    vi.advanceTimersByTime(3000);
    // A blob: report from elsewhere on the page, long after this worker loaded.
    violation();
    workers[0]?.onerror?.(new Event("error"));
    vi.runAllTimers();
    expect(stops).toEqual(["Crashed."]);
  } finally {
    vi.useRealTimers();
  }
});
it("logs the original error when the constructor fails for another reason", async () => {
  behavior = "throws-other";
  const { stops } = start("other");
  await Promise.resolve();
  expect(stops).toEqual(["Crashed."]);
  expect(errors).toHaveBeenCalledWith(
    "OpenDIL: could not start the other worker.",
    expect.objectContaining({ message: "Out of workers" }),
  );
});
/** Trusted Types state lives in the module, so each case imports a fresh copy. */
type Rules = { createScriptURL(url: string): string };
async function freshModule(
  createPolicy: (name: string, rules: Rules) => unknown,
) {
  vi.stubGlobal("trustedTypes", { createPolicy });
  vi.resetModules();
  return import("../../packages/opendil/src/dil/runtime/inline-worker");
}
it("creates blob: worker URLs through its own Trusted Types policy", async () => {
  behavior = "trusted-types";
  const names: string[] = [];
  const fresh = await freshModule((name) => {
    names.push(name);
    return { createScriptURL: (url: string) => ({ trusted: url }) };
  });
  const stops: string[] = [];
  const options = {
    role: "trusted",
    crashMessage: "Crashed.",
    onMessage: () => {},
    onStop: (message: string) => stops.push(message),
  };
  fresh.startInlineWorker("", options).dispose();
  fresh.startInlineWorker("", options).dispose();
  expect(names).toEqual([fresh.TRUSTED_TYPES_POLICY]);
  expect(workers.map((worker) => worker.url)).toEqual([
    { trusted: expect.stringMatching(/^blob:/) },
    { trusted: expect.stringMatching(/^blob:/) },
  ]);
  expect(stops).toEqual([]);
});
it("only lets its Trusted Types policy pass blob: URLs", async () => {
  let rules: Rules | undefined;
  const fresh = await freshModule((_, given) => {
    rules = given;
    return { createScriptURL: (url: string) => given.createScriptURL(url) };
  });
  fresh
    .startInlineWorker("", {
      role: "rules",
      crashMessage: "Crashed.",
      onMessage: () => {},
      onStop: () => {},
    })
    .dispose();
  expect(rules?.createScriptURL("blob:https://app.test/1")).toBe(
    "blob:https://app.test/1",
  );
  expect(() => rules?.createScriptURL("https://cdn.test/a.js")).toThrow(
    TypeError,
  );
});
it("explains a worker refused by Trusted Types when the policy name is not allowed", async () => {
  behavior = "trusted-types";
  const fresh = await freshModule(() => {
    throw new TypeError("Policy opendil disallowed.");
  });
  const stops: string[] = [];
  fresh.startInlineWorker("", {
    role: "typed",
    crashMessage: "Crashed.",
    onMessage: () => {},
    onStop: (message) => stops.push(message),
  });
  await Promise.resolve();
  expect(stops).toEqual([fresh.POLICY_BLOCKED_MESSAGE]);
  const diagnostic = String(errors.mock.calls[0]?.[0]);
  expect(diagnostic).toContain("Trusted Types policy blocked the typed worker");
  expect(diagnostic).toContain('"trusted-types opendil"');
});
it("tells developers to keep the app policy off the isolated frame", async () => {
  behavior = "policy";
  vi.stubGlobal("origin", "null");
  vi.stubGlobal("parent", {});
  const { stops } = start("framed");
  await vi.waitFor(() => expect(stops).toEqual([POLICY_BLOCKED_MESSAGE]));
  const diagnostic = String(errors.mock.calls[0]?.[0]);
  expect(diagnostic).toContain("inside OpenDIL's isolated frame");
  expect(diagnostic).not.toContain('mode="host"');
});
function fatalEngine() {
  const engine = new ExpressionEngine();
  const halted: string[] = [];
  engine.events.addEventListener("dil:error", (event) => {
    if (event instanceof CustomEvent) halted.push(String(event.detail));
  });
  engine.declare("const [count] = DIL.useState(0)");
  const worker = workers.at(-1);
  const request = worker?.posted[0] as { id: number } | undefined;
  if (!worker || !request) throw new Error("Missing declaration request");
  worker.onmessage?.({
    data: { id: request.id, fatal: "QuickJS failed to start" },
  });
  engine.dispose();
  return halted;
}
it("names wasm-unsafe-eval when the page policy blocks WebAssembly", () => {
  vi.spyOn(WebAssembly, "Module").mockImplementation(() => {
    throw new WebAssembly.CompileError("violates Content Security policy");
  });
  expect(fatalEngine()).toEqual([WASM_BLOCKED_MESSAGE]);
  expect(String(errors.mock.calls[0]?.[0])).toContain(
    "blocks WebAssembly, so document expressions cannot run",
  );
});
it("keeps the runtime failure when WebAssembly compiles", () => {
  expect(fatalEngine()).toEqual(["Execution stopped: QuickJS failed to start"]);
  expect(errors).not.toHaveBeenCalled();
});
it("shows readers the policy message instead of a parser crash", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  behavior = "policy";
  const mount = document.createElement("div");
  document.body.append(mount);
  const root = createRoot(mount);
  try {
    await act(() =>
      root.render(createElement(MessageRenderer, { text: "# Title" })),
    );
    await vi.waitFor(() =>
      expect(mount.querySelector('[role="alert"]')?.textContent).toBe(
        POLICY_BLOCKED_MESSAGE,
      ),
    );
    expect(mount.textContent).not.toContain("parser stopped");
    expect(String(errors.mock.calls[0]?.[0])).toMatch(
      /blocked the (document parser|expression runtime) worker/,
    );
  } finally {
    await act(() => root.unmount());
    mount.remove();
  }
  expect(workers.every((worker) => worker.terminated)).toBe(true);
});
