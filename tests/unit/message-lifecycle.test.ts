// @vitest-environment happy-dom
import { act, createElement, type ComponentType } from "react";
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

it("frees the parser after the final batch and never starts QuickJS for plain Markdown", async () => {
  await render({ text: "# Title\n\nPlain answer with `{ code }`." });
  const [parserWorker] = byRole("parser");
  if (!parserWorker) throw new Error("Missing parser worker");
  answer(new DilParser(), parserWorker);
  await frame();
  await vi.waitFor(() => expect(mount.textContent).toContain("{ code }"));
  expect(parserWorker.terminated).toBe(true);
  expect(byRole("vm")).toEqual([]);
  expect(mount.querySelector('[role="alert"]')).toBeNull();
});

it("keeps the parser while streaming and starts QuickJS when state appears", async () => {
  const parser = new DilParser();
  await render({ text: "Intro ", isStreaming: true });
  const [parserWorker] = byRole("parser");
  if (!parserWorker) throw new Error("Missing parser worker");
  let answered = answer(parser, parserWorker);
  await frame();
  expect(parserWorker.terminated).toBe(false);
  expect(byRole("vm")).toEqual([]);

  const text = "Intro {@body const [n] = DIL.useState(1)}<text>{n}</text>";
  await render({ text, isStreaming: true });
  answered = answer(parser, parserWorker, answered);
  await frame();
  expect(byRole("vm")).toHaveLength(1);
  expect(parserWorker.terminated).toBe(false);

  await render({ text, isStreaming: false });
  answer(parser, parserWorker, answered);
  await frame();
  expect(parserWorker.terminated).toBe(true);
  expect(byRole("vm")[0]?.terminated).toBe(false);

  // Finalized text is a restart error, not a message to the stopped parser.
  await render({ text: text + " more", isStreaming: false });
  expect(mount.textContent).toContain("Start a new renderer instance");
  expect(byRole("parser")).toHaveLength(1);
});

it("reports a restart when a finalized message streams more text", async () => {
  const parser = new DilParser();
  await render({ text: "Step one.", isStreaming: true });
  const [parserWorker] = byRole("parser");
  if (!parserWorker) throw new Error("Missing parser worker");
  let answered = answer(parser, parserWorker);
  await render({ text: "Step one.", isStreaming: false });
  answered = answer(parser, parserWorker, answered);
  await frame();
  expect(parserWorker.terminated).toBe(true);

  // Resuming the same message keeps the final document without an error.
  await render({ text: "Step one.", isStreaming: true });
  expect(mount.querySelector('[role="alert"]')).toBeNull();
  await render({ text: "Step one. Step two.", isStreaming: true });
  expect(mount.querySelector('[role="alert"]')?.textContent).toContain(
    "Start a new renderer instance",
  );
  expect(parserWorker.posted).toHaveLength(answered);
  expect(byRole("parser")).toHaveLength(1);
});

it("does not post text that arrives before the final batch is committed", async () => {
  await render({ text: "Done.", isStreaming: false });
  const [parserWorker] = byRole("parser");
  if (!parserWorker) throw new Error("Missing parser worker");
  await render({ text: "Done.", isStreaming: true });
  await render({ text: "Done. Again", isStreaming: true });
  expect(parserWorker.posted).toEqual([{ suffix: "Done.", complete: true }]);
  expect(mount.textContent).toContain("Start a new renderer instance");
  answer(new DilParser(), parserWorker);
  await frame();
  expect(parserWorker.terminated).toBe(true);
});

it("tells the parser which lowercase tags the host registered", async () => {
  const Callout = () => createElement("aside", null, "custom");
  await render(
    { text: "<callout>x</callout>", isStreaming: true },
    { callout: Callout },
  );
  await render(
    { text: "<callout>x</callout> ", isStreaming: false },
    { callout: Callout },
  );
  const [parserWorker] = byRole("parser");
  expect(parserWorker?.posted).toEqual([
    {
      suffix: "<callout>x</callout>",
      complete: false,
      components: ["callout"],
    },
    { suffix: " ", complete: true },
  ]);
  answer(new DilParser(), parserWorker as FakeWorker);
  await frame();
  await vi.waitFor(() => expect(mount.querySelector("aside")).not.toBeNull());
});

it("starts the QuickJS worker on the first job only", () => {
  const idle = new ExpressionEngine();
  idle.retain([]);
  idle.halt("Stopped before any expression");
  idle.dispose();
  expect(workers).toEqual([]);
  const engine = new ExpressionEngine();
  expect(() => engine.evaluate("1 + 1")).toThrow("Waiting");
  expect(() => engine.evaluate("2 + 2")).toThrow("Waiting");
  expect(byRole("vm")).toHaveLength(1);
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
    const parser = new DilParser();
    await show(CUT, true);
    const [parserWorker] = byRole("parser");
    if (!parserWorker) throw new Error("Missing parser worker");
    const answered = answer(parser, parserWorker);
    await frame();
    expect(status()).toBe("Receiving document");

    await show(CUT, false);
    expect(parserWorker.posted.at(-1)).toEqual({ suffix: "", complete: true });
    answer(parser, parserWorker, answered);
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
    expect(parserWorker.terminated).toBe(true);
  });

  it("tells readers the response ended early even without the status label", async () => {
    await show(CUT, false, false);
    answer(new DilParser(), byRole("parser")[0] as FakeWorker);
    await frame();
    expect(mount.textContent).not.toContain("Incomplete");
    expect(mount.querySelector("[data-dil-incomplete]")?.textContent).toBe(
      "This response ended before it was finished.",
    );
  });

  it("finishes the document as a limit when the parser reaches its node limit", async () => {
    const parser = new DilParser();
    await show("<box>Kept</box>", true);
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
    expect(errors).toEqual([{ kind: "limit", message }]);
    expect(commits.at(-1)).toMatchObject({ complete: true });
    expect(parserWorker.terminated).toBe(true);
  });

  it("reads Complete for a finished document", async () => {
    await show("<box>Done</box>", false);
    answer(new DilParser(), byRole("parser")[0] as FakeWorker);
    await frame();
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
    answer(new DilParser(), byRole("parser")[0] as FakeWorker);
    await frame();
    expect(mount.querySelector("[data-complete=true]")).not.toBeNull();
    // Only the empty clipboard announcement region remains.
    expect(status()).toBe("");
    expect(mount.textContent).toBe("");
    expect(errors).toEqual([]);
  });

  it("reports malformed source and an unsupported restart once each", async () => {
    await show('<slider max=5 value="1"/>', false);
    answer(new DilParser(), byRole("parser")[0] as FakeWorker);
    await frame();
    expect(mount.querySelector('[role="alert"]')?.textContent).toBe(
      "This part of the response couldn't be shown.",
    );
    await show('<slider max=5 value="1"/> more', false);
    await show('<slider max=5 value="1"/> more again', false);
    expect(errors).toEqual([
      {
        kind: "syntax",
        message: "Expected quoted value or expression for max",
        offset: 0,
      },
      {
        kind: "source",
        message:
          "Start a new renderer instance before replacing or restarting the document.",
      },
    ]);
  });
});
