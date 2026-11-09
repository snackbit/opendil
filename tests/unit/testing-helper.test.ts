// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installInlineWorkers } from "../../packages/opendil/src/testing";
import {
  DilRenderer,
  preloadHostRenderer,
} from "../../packages/opendil/src/dil/dil-renderer";
import { ParserSession } from "../../packages/opendil/src/dil/parser/parser-session";
import { INLINE_WORKER_HOOK } from "../../packages/opendil/src/dil/runtime/inline-worker-hook";
import { REPLACED_WORKER_MESSAGE } from "../../packages/opendil/src/dil/runtime/inline-worker";
import type { ParserReply } from "../../packages/opendil/src/dil/parser/types";
import type { DilRenderError } from "../../packages/opendil/src/dil/render-error";

let mount: HTMLDivElement;
let root: Root;
let uninstall: () => void;
beforeEach(async () => {
  // Loading the host chunk is slow under coverage; tests time rendering, not imports.
  await preloadHostRenderer();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // Source builds read the embedded worker sources as globals.
  vi.stubGlobal("__DIL_PARSER_WORKER__", "");
  vi.stubGlobal("__DIL_VM_WORKER__", "");
  // Like jsdom: no worker or blob: URL support at all.
  vi.stubGlobal("Worker", undefined);
  uninstall = installInlineWorkers();
  mount = document.createElement("div");
  document.body.append(mount);
  root = createRoot(mount);
});
afterEach(async () => {
  await act(() => root.unmount());
  mount.remove();
  uninstall();
  vi.unstubAllGlobals();
});
async function show(text: string, onError?: (error: DilRenderError) => void) {
  await act(() =>
    root.render(
      createElement(DilRenderer, {
        mode: "host",
        text,
        showStatus: false,
        ...(onError ? { onError } : {}),
      }),
    ),
  );
}

describe("installInlineWorkers", () => {
  it("parses documents in the calling thread and renders JSON literals", async () => {
    await show('# Report\n\n<badge>{"Ready"}</badge> {3} items');
    await vi.waitFor(() =>
      expect(mount.querySelector("h1")?.textContent).toBe("Report"),
    );
    await vi.waitFor(() => expect(mount.textContent).toContain("3 items"));
    expect(mount.querySelector('[data-slot="badge"]')?.textContent).toBe(
      "Ready",
    );
    expect(mount.querySelector('[role="alert"]')).toBeNull();
  });
  it("reports expressions as blocked instead of running them", async () => {
    const errors: DilRenderError[] = [];
    await show("{@body const [n] = DIL.useState(1)}<text>{n}</text>", (error) =>
      errors.push(error),
    );
    await vi.waitFor(() =>
      expect(errors).toContainEqual({
        kind: "runtime",
        code: "worker-blocked-policy",
        message: REPLACED_WORKER_MESSAGE,
      }),
    );
    expect(mount.querySelector('[role="alert"]')?.textContent).toBe(
      REPLACED_WORKER_MESSAGE,
    );
  });
  it("stays silent once terminated, like a worker", async () => {
    const slot = globalThis as {
      [INLINE_WORKER_HOOK]?: (role: string) => unknown;
    };
    const port = slot[INLINE_WORKER_HOOK]?.("document parser") as {
      onmessage: ((event: { data: unknown }) => void) | null;
      postMessage(message: unknown): void;
      terminate(): void;
    };
    const replies: unknown[] = [];
    port.onmessage = (event) => replies.push(event.data);
    port.postMessage({ suffix: "Answered", complete: true });
    await vi.waitFor(() => expect(replies).toHaveLength(1));
    port.postMessage({ suffix: " cut", complete: true });
    port.terminate();
    port.postMessage({ suffix: " ignored", complete: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(replies).toHaveLength(1);
  });
  it("restores the previous replacement when removed", () => {
    const slot = globalThis as { [INLINE_WORKER_HOOK]?: unknown };
    const outer = slot[INLINE_WORKER_HOOK];
    const inner = installInlineWorkers();
    expect(slot[INLINE_WORKER_HOOK]).not.toBe(outer);
    inner();
    expect(slot[INLINE_WORKER_HOOK]).toBe(outer);
    uninstall();
    expect(INLINE_WORKER_HOOK in slot).toBe(false);
    uninstall = installInlineWorkers();
  });
});

describe("the parser session behind both workers", () => {
  function session(maxNodes?: number) {
    const replies: ParserReply[] = [];
    const scheduled: (() => void)[] = [];
    const parser = new ParserSession((reply) => replies.push(reply), {
      schedule: (next) => scheduled.push(next),
      ...(maxNodes === undefined ? {} : { maxNodes }),
    });
    const drain = () => {
      while (scheduled.length) scheduled.shift()?.();
    };
    return { parser, replies, drain };
  }
  it("answers in bounded chunks and finalizes only the last one", () => {
    const { parser, replies, drain } = session();
    parser.receive({ suffix: "a".repeat(40000), complete: true });
    parser.receive({ suffix: "", complete: true, components: ["callout"] });
    drain();
    const batches = replies.filter((reply) => "revision" in reply);
    expect(batches.map((batch) => batch.complete)).toEqual([
      false,
      false,
      true,
      true,
    ]);
    expect(batches.at(-1)?.scanned).toBe(40000);
  });
  it("stops at the node limit and ignores later input", () => {
    const { parser, replies, drain } = session(3);
    parser.receive({ suffix: "<box/><box/><box/>", complete: false });
    parser.receive({ suffix: "more", complete: true });
    drain();
    expect(replies).toEqual([
      {
        stopped: "limit",
        message:
          "Rendering stopped: this message has more parts than the renderer supports.",
      },
    ]);
  });
});
