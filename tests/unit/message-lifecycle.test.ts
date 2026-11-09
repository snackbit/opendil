// @vitest-environment happy-dom
import { act, createElement, StrictMode, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DilParser } from "../../packages/opendil/src/dil/parser/dil-parser";
import type { StreamInput } from "../../packages/opendil/src/dil/parser/types";
import { ExpressionEngine } from "../../packages/opendil/src/dil/runtime/expressions";
import { MessageRenderer } from "../../packages/opendil/src/dil/message-renderer";
import {
  CustomizationContext,
  type DilComponentProps,
} from "../../packages/opendil/src/dil/customization";
import {
  RendererEnvironmentContext,
  type RendererMetrics,
} from "../../packages/opendil/src/dil/renderer-environment";
import type { DilRenderError } from "../../packages/opendil/src/dil/render-error";

// Workers are identified by their source: the parser and the QuickJS runtime.
class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event?: Event) => void) | null = null;
  terminated = false;
  posted: unknown[] = [];
  constructor(readonly role: string) {
    workers.push(this);
  }
  postMessage(message: unknown) {
    if (this.terminated) throw new Error("Posted to a terminated worker");
    // The runtime's boot message carries no work.
    if ((message as { type?: string }).type !== "init")
      this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
}
const workers: FakeWorker[] = [];
const byRole = (role: string) => workers.filter((w) => w.role === role);
let mount: HTMLDivElement;
let root: Root;
beforeEach(() => {
  workers.length = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("__DIL_PARSER_WORKER__", "parser");
  vi.stubGlobal("__DIL_VM_WORKER__", "vm");
  // The worker URL names the role so each fake knows which worker it stands for.
  vi.spyOn(URL, "createObjectURL").mockImplementation(
    (blob) => (blob as Blob & { role?: string }).role ?? "",
  );
  const NativeBlob = Blob;
  vi.stubGlobal(
    "Blob",
    class extends NativeBlob {
      role: string;
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        this.role = String(parts[0]);
      }
    },
  );
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  mount = document.createElement("div");
  document.body.append(mount);
  root = createRoot(mount);
});
afterEach(async () => {
  await act(() => root.unmount());
  mount.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Lets the fake parser answer with what the real parser produces for its input. */
function answer(parser: DilParser, worker: FakeWorker, from = 0) {
  for (const message of worker.posted.slice(from) as StreamInput[]) {
    parser.allow(message.components);
    worker.onmessage?.({
      data: parser.append(message.suffix, message.complete),
    });
  }
  return worker.posted.length;
}
async function render(
  props: { text: string; isStreaming?: boolean },
  components?: Record<string, ComponentType<DilComponentProps>>,
) {
  const message = createElement(MessageRenderer, props);
  await act(() =>
    root.render(
      components
        ? createElement(
            CustomizationContext.Provider,
            { value: { components } },
            message,
          )
        : message,
    ),
  );
}
const frame = () =>
  act(() => new Promise((resolve) => requestAnimationFrame(resolve)));

it("renders text that is complete at mount in the first commit, without workers", async () => {
  await render({ text: "# Title\n\nPlain answer with `{ code }`." });
  expect(mount.querySelector("h1")?.textContent).toBe("Title");
  expect(mount.textContent).toContain("{ code }");
  expect(mount.querySelector("[data-complete=true]")).not.toBeNull();
  expect(workers).toEqual([]);
  expect(mount.querySelector('[role="alert"]')).toBeNull();
});

it("keeps complete text rendered through a StrictMode remount, still without workers", async () => {
  const errors: DilRenderError[] = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await act(() =>
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(
          RendererEnvironmentContext.Provider,
          { value: { onError: (error) => errors.push(error) } },
          createElement(MessageRenderer, { text: "# Kept\n\n<Missing/>" }),
        ),
      ),
    ),
  );
  expect(mount.querySelector("h1")?.textContent).toBe("Kept");
  expect(mount.querySelector('[role="alert"]')).not.toBeNull();
  expect(workers).toEqual([]);
  expect(errors.map((error) => error.code)).toContain("unknown-component");
});

it("starts no worker while rendering complete text with state, so discarded renders leak none", async () => {
  const text = "{@body const [n] = DIL.useState(1)}<text>{n}</text>";
  const live = () => byRole("vm").filter((worker) => !worker.terminated);
  // StrictMode renders twice and discards one result, then remounts effects.
  await act(() =>
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(MessageRenderer, { text, isStreaming: false }),
      ),
    ),
  );
  expect(live()).toHaveLength(1);
  // The replayed effect adopts the same document and its runtime.
  expect(byRole("vm")).toHaveLength(1);
  // The declaration reaches the runtime before the expression that reads it,
  // in the same batch.
  expect(live()[0]?.posted).toEqual([
    expect.objectContaining({
      type: "batch",
      steps: [expect.objectContaining({ type: "declare" })],
      evaluations: [expect.objectContaining({ source: "n" })],
    }),
  ]);
  await act(() => root.unmount());
  root = createRoot(mount);
  // Disposal waits one task, in case React replays the effect.
  await vi.waitFor(() => expect(live()).toEqual([]));
});

it("adds the clipboard announcement region only with an action control", async () => {
  const region = () => mount.querySelector("[data-dil-clipboard-status]");
  await render({ text: "# Title" });
  expect(region()).toBeNull();
  await act(() => root.unmount());
  root = createRoot(mount);
  await render({ text: "<button>Go</button>" });
  expect(region()?.getAttribute("role")).toBe("status");
  expect(region()?.textContent).toBe("");
});

it("leaves complete text over the node limit to the worker, which reports the limit", async () => {
  await render({ text: "<divider/>".repeat(100_001) });
  const [parserWorker] = byRole("parser");
  expect(parserWorker?.posted).toHaveLength(1);
});

it("reports problems found in the first render once the host listens", async () => {
  const errors: DilRenderError[] = [];
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await act(() =>
    root.render(
      createElement(
        RendererEnvironmentContext.Provider,
        { value: { onError: (error) => errors.push(error) } },
        createElement(MessageRenderer, { text: '<slider max=5 value="1"/>' }),
      ),
    ),
  );
  expect(errors).toEqual([
    expect.objectContaining({ code: "malformed-syntax", offset: 0 }),
  ]);
  expect(warn).toHaveBeenCalledTimes(1);
});

it("parses a stream in the calling thread and never starts QuickJS for plain Markdown", async () => {
  const text = "# Title\n\nPlain answer with `{ code }`.";
  await render({ text: "# Title\n\nPlain", isStreaming: true });
  // The prefix renders in the first commit, without a parser worker.
  expect(mount.querySelector("h1")?.textContent).toBe("Title");
  await render({ text, isStreaming: false });
  await frame();
  await vi.waitFor(() => expect(mount.textContent).toContain("{ code }"));
  expect(workers).toEqual([]);
  expect(mount.querySelector('[role="alert"]')).toBeNull();
});

it("leaves a stream over the first-render limit to the parser worker", async () => {
  const text = "x".repeat(1_048_577);
  await render({ text, isStreaming: true });
  const [parserWorker] = byRole("parser");
  expect(parserWorker?.posted).toEqual([{ suffix: text, complete: false }]);
  await render({ text, isStreaming: false });
  expect(parserWorker?.posted.at(-1)).toEqual({ suffix: "", complete: true });
  answer(new DilParser(), parserWorker as FakeWorker);
  await frame();
  expect(parserWorker?.terminated).toBe(true);
});

it("terminates the parser of a keyed renderer that unmounts before its document finishes", async () => {
  await act(() =>
    root.render(
      createElement(MessageRenderer, {
        text: "x".repeat(1_048_577),
        isStreaming: true,
        cacheKey: "message:large",
      }),
    ),
  );
  const [parserWorker] = byRole("parser");
  expect(parserWorker?.terminated).toBe(false);
  await act(() => root.render(null));
  expect(parserWorker?.terminated).toBe(true);
});

it("starts QuickJS when state appears in a stream", async () => {
  await render({ text: "Intro ", isStreaming: true });
  await frame();
  expect(byRole("vm")).toEqual([]);
  const text = "Intro {@body const [n] = DIL.useState(1)}<text>{n}</text>";
  await render({ text, isStreaming: true });
  await frame();
  expect(byRole("vm")).toHaveLength(1);
  await render({ text, isStreaming: false });
  await frame();
  expect(byRole("vm")[0]?.terminated).toBe(false);
  // Finalized text is a restart error.
  await render({ text: text + " more", isStreaming: false });
  expect(mount.textContent).toContain("Start a new renderer instance");
  expect(byRole("parser")).toEqual([]);
});

it("reports a restart when a finalized message streams more text", async () => {
  await render({ text: "Step one.", isStreaming: true });
  await render({ text: "Step one.", isStreaming: false });
  await frame();
  // Resuming the same message keeps the final document without an error.
  await render({ text: "Step one.", isStreaming: true });
  expect(mount.querySelector('[role="alert"]')).toBeNull();
  await render({ text: "Step one. Step two.", isStreaming: true });
  expect(mount.querySelector('[role="alert"]')?.textContent).toContain(
    "Start a new renderer instance",
  );
  expect(mount.textContent).not.toContain("Step two.");
});

it("rejects a replaced source of the same length instead of appending to it", async () => {
  const errors: DilRenderError[] = [];
  const show = (text: string) =>
    act(() =>
      root.render(
        createElement(
          RendererEnvironmentContext.Provider,
          { value: { onError: (error: DilRenderError) => errors.push(error) } },
          createElement(MessageRenderer, { text, isStreaming: true }),
        ),
      ),
    );
  await show("Alpha draft");
  await show("Omega draft");
  await show("Omega draft, longer");
  await frame();
  // A stream's last characters wait for what follows them.
  expect(mount.textContent).toContain("Alpha dra");
  expect(mount.textContent).not.toContain("Omega");
  expect(errors).toEqual([
    {
      kind: "source",
      code: "source-replaced",
      message:
        "The source was replaced. Start a new renderer instance (a new key) before replacing the document.",
    },
  ]);
  expect(mount.querySelector('[role="alert"]')?.textContent).toContain(
    "Start a new renderer instance",
  );
});

it("parses no text that arrives after the final text", async () => {
  await render({ text: "Done", isStreaming: true });
  await render({ text: "Done.", isStreaming: false });
  await render({ text: "Done.", isStreaming: true });
  await render({ text: "Done. Again", isStreaming: true });
  await frame();
  expect(mount.textContent).toContain("Start a new renderer instance");
  expect(mount.textContent).toContain("Done.");
  expect(mount.textContent).not.toContain("Again");
});

it("rejects growth after text that was complete at mount", async () => {
  await render({ text: "Done.", isStreaming: false });
  await render({ text: "Done. Again", isStreaming: true });
  expect(mount.textContent).toContain("Start a new renderer instance");
  expect(workers).toEqual([]);
});

// A host can create the message before its first token, not streaming yet.
it("streams into an empty message that mounted before it started, revealing the new text", async () => {
  // happy-dom rejects a cancelled animation's promise; browsers only reject it once read.
  vi.spyOn(HTMLElement.prototype, "animate").mockImplementation(
    () =>
      ({ cancel() {}, onfinish: null, oncancel: null }) as unknown as Animation,
  );
  const show = (text: string, isStreaming: boolean) =>
    act(() =>
      root.render(
        createElement(MessageRenderer, {
          text,
          isStreaming,
          progressiveReveal: true,
        }),
      ),
    );
  await show("", false);
  await show("", true);
  await show("# Plan\n\nFirst step.\n\n", true);
  await frame();
  expect(mount.querySelector('[role="alert"]')).toBeNull();
  // Streamed in after the start, so it reveals rather than appearing at once.
  const heading = mount.querySelector("h1");
  expect(heading?.textContent).toBe("Plan");
  expect(heading?.dataset.dilPhase).toMatch(/^(ready|revealing)$/);
  await show("# Plan\n\nFirst step.\n\nDone.", false);
  await frame();
  expect(mount.textContent).toContain("Done.");
  expect(heading?.isConnected).toBe(true);
  expect(heading?.dataset.dilPhase).toBe("visible");
});

it("shows finished text that arrives for an empty message as a new document", async () => {
  await render({ text: "", isStreaming: false });
  await render({ text: "Answer.", isStreaming: false });
  await frame();
  expect(mount.querySelector('[role="alert"]')).toBeNull();
  expect(mount.textContent).toContain("Answer.");
});

it("parses the lowercase tags the host registered as its components", async () => {
  const Callout = () => createElement("aside", null, "custom");
  await render(
    { text: "<callout>x</callout>", isStreaming: true },
    { callout: Callout },
  );
  await render(
    { text: "<callout>x</callout> ", isStreaming: false },
    { callout: Callout },
  );
  await frame();
  await vi.waitFor(() => expect(mount.querySelector("aside")).not.toBeNull());
});

it("starts the QuickJS worker on the first job only", async () => {
  const idle = new ExpressionEngine();
  idle.retain([]);
  idle.halt("Stopped before any expression");
  idle.dispose();
  expect(workers).toEqual([]);
  const engine = new ExpressionEngine();
  expect(() => engine.evaluate("1 + 1")).toThrow("Waiting");
  expect(() => engine.evaluate("2 + 2")).toThrow("Waiting");
  await Promise.resolve();
  expect(byRole("vm")).toHaveLength(1);
  // Both evaluations leave in one batch.
  expect(byRole("vm")[0]?.posted).toEqual([
    expect.objectContaining({
      type: "batch",
      evaluations: [
        expect.objectContaining({ source: "1 + 1" }),
        expect.objectContaining({ source: "2 + 2" }),
      ],
    }),
  ]);
  engine.dispose();
  expect(byRole("vm")[0]?.terminated).toBe(true);
});

describe("a message that ends early", () => {
  let errors: DilRenderError[];
  let commits: RendererMetrics[];
  const environment = {
    onError: (error: DilRenderError) => errors.push(error),
    onCommit: (detail: RendererMetrics) => commits.push(detail),
  };
  beforeEach(() => {
    errors = [];
    commits = [];
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  async function show(text: string, isStreaming: boolean, showStatus = true) {
    await act(() =>
      root.render(
        createElement(
          RendererEnvironmentContext.Provider,
          { value: environment },
          createElement(MessageRenderer, { text, isStreaming, showStatus }),
        ),
      ),
    );
  }
  const status = () => mount.querySelector('[role="status"]')?.textContent;
  const CUT =
    "<grid><box border>First card</box><box border>Second card</box><box border>Thi";

  // AI SDK hosts flip isStreaming to false after stop() without sending more text.
  it("finalizes when isStreaming turns false without new text", async () => {
    await show(CUT, true);
    await frame();
    expect(status()).toBe("Receiving document");

    await show(CUT, false);
    await frame();
    expect(status()).toBe("Incomplete");
    expect(mount.querySelector("[data-incomplete=true]")).not.toBeNull();
    expect(mount.textContent).toContain("First card");
    expect(mount.textContent).toContain("Second card");
    expect(mount.textContent).toContain(
      "This response ended before it was finished.",
    );
    expect(mount.textContent).not.toContain("character");
    expect(mount.querySelector('[role="alert"]')).toBeNull();
    expect(errors).toEqual([
      expect.objectContaining({ kind: "incomplete", offset: 0 }),
    ]);
    expect(commits.at(-1)).toEqual({
      scanned: CUT.length,
      complete: true,
      incomplete: true,
    });
    expect(workers).toEqual([]);
  });

  it("tells readers the response ended early even without the status label", async () => {
    await show(CUT, false, false);
    expect(mount.textContent).not.toContain("Incomplete");
    expect(mount.querySelector("[data-dil-incomplete]")?.textContent).toBe(
      "This response ended before it was finished.",
    );
  });

  it("finishes the document as a limit when the parser reaches its node limit", async () => {
    const parser = new DilParser();
    // Over the first-render limit, so the worker parses it.
    const padding = " ".repeat(1_048_577);
    await show("<box>Kept</box>" + padding, true);
    const [parserWorker] = byRole("parser");
    if (!parserWorker) throw new Error("Missing parser worker");
    answer(parser, parserWorker);
    const message =
      "Rendering stopped: this message has more parts than the renderer supports.";
    parserWorker.onmessage?.({ data: { stopped: "limit", message } });
    await frame();
    expect(mount.textContent).toContain("Kept");
    expect(mount.querySelector('[role="alert"]')?.textContent).toBe(message);
    expect(status()).toBe("Complete");
    expect(errors).toEqual([
      { kind: "limit", code: "parser-node-limit", message },
    ]);
    expect(commits.at(-1)).toMatchObject({ complete: true });
    expect(parserWorker.terminated).toBe(true);
  });

  it("reads Complete for a finished document", async () => {
    await show("<box>Done</box>", false);
    expect(status()).toBe("Complete");
    expect(mount.textContent).not.toContain("ended before");
    expect(errors).toEqual([]);
    expect(commits.at(-1)?.incomplete).toBe(false);
  });

  // A provider error before any text leaves the host's own error notice.
  it("shows no status label for a finished message without content", async () => {
    await show("", true);
    expect(status()).toBe("Receiving document");
    await show(" \n", false);
    await frame();
    expect(mount.querySelector("[data-complete=true]")).not.toBeNull();
    // No label, and no clipboard announcement region without actions.
    expect(status()).toBeUndefined();
    expect(mount.textContent).toBe("");
    expect(errors).toEqual([]);
  });

  it("reports malformed source and an unsupported restart once each", async () => {
    await show('<slider max=5 value="1"/>', false);
    expect(mount.querySelector('[role="alert"]')?.textContent).toBe(
      "This part of the response couldn't be shown.",
    );
    await show('<slider max=5 value="1"/> more', false);
    await show('<slider max=5 value="1"/> more again', false);
    expect(errors).toEqual([
      {
        kind: "syntax",
        code: "malformed-syntax",
        message: "Expected quoted value or expression for max",
        offset: 0,
      },
      {
        kind: "source",
        code: "source-after-final",
        message:
          "The source grew after the document was finalized. Start a new renderer instance before restarting the document.",
      },
    ]);
  });
});
