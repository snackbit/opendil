// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installInlineWorkers } from "../../packages/opendil/src/testing";
import {
  DilRenderer,
  preloadHostRenderer,
} from "../../packages/opendil/src/dil/dil-renderer";
import { ExpressionEngine } from "../../packages/opendil/src/dil/runtime/expressions";
import {
  INLINE_WORKER_HOOK,
  type InlineWorkerFactory,
} from "../../packages/opendil/src/dil/runtime/inline-worker-hook";

/** Roles of the workers OpenDIL started, through the testing replacement. */
let started: string[];
let uninstall: () => void;
beforeEach(async () => {
  // Loading the host chunk is slow under coverage; tests time rendering, not imports.
  await preloadHostRenderer();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("__DIL_PARSER_WORKER__", "");
  vi.stubGlobal("__DIL_VM_WORKER__", "");
  started = [];
  uninstall = installInlineWorkers();
  const slot = globalThis as { [INLINE_WORKER_HOOK]?: InlineWorkerFactory };
  const factory = slot[INLINE_WORKER_HOOK];
  slot[INLINE_WORKER_HOOK] = (role) => {
    started.push(role);
    return factory?.(role) ?? "blocked";
  };
});
afterEach(() => {
  uninstall();
  vi.unstubAllGlobals();
});

it("renders string and number literals without starting QuickJS", async () => {
  const mount = document.createElement("div");
  document.body.append(mount);
  const root: Root = createRoot(mount);
  await act(() =>
    root.render(
      createElement(DilRenderer, {
        mode: "host",
        showStatus: false,
        text: '<title>{"Revenue"}</title>\n\n{3} regions {#if true}shown{/if}\n\n<Chart content={{"chartType":"bar","xKey":"x","series":[{"dataKey":"y","label":"Y"}],"data":[{"x":"a","y":1}]}}/>',
      }),
    ),
  );
  await vi.waitFor(() => expect(mount.textContent).toContain("3 regions"));
  expect(mount.querySelector("h3")?.textContent).toBe("Revenue");
  expect(mount.textContent).toContain("shown");
  // Complete text parses in the first render; nothing starts a worker.
  expect(started).toEqual([]);
  expect(mount.querySelector('[role="alert"]')).toBeNull();
  await act(() => root.unmount());
  mount.remove();
});

it("reads JSON values synchronously with the output limits of QuickJS results", () => {
  const engine = new ExpressionEngine();
  const release = engine.retain(['"x"', " 3 ", "null", '{"a":[1,true]}']);
  expect(engine.read('"x"')).toBe("x");
  expect(engine.evaluate(" 3 ")).toBe(3);
  expect(engine.read("null")).toBeNull();
  expect(engine.read('{"a":[1,true]}')).toEqual({ a: [1, true] });
  expect(engine.isFresh('"x"')).toBe(true);
  expect(engine.hasValue('"x"')).toBe(true);
  // Keys that revive differently from the VM's output are dropped the same way.
  expect(engine.read('{"constructor":1,"b":2}')).toEqual({ b: 2 });
  const wide = JSON.stringify(Array(10001).fill(0));
  expect(engine.hasValue(wide)).toBe(false);
  expect(() => engine.read(wide)).toThrow("structural limits");
  expect(() => engine.evaluate(wide)).toThrow("structural limits");
  const deep = "[".repeat(70) + "]".repeat(70);
  expect(() => engine.read(deep)).toThrow("structural limits");
  // The expression source cap applies to code QuickJS compiles, not to data.
  const long = JSON.stringify("x".repeat(70000));
  expect(engine.read(long)).toHaveLength(70000);
  release();
  expect(started).toEqual([]);
  engine.dispose();
});

it("leaves JavaScript-only meanings to QuickJS", async () => {
  const engine = new ExpressionEngine();
  for (const source of [
    "1 + 1",
    '{"__proto__":{"polluted":true}}',
    '{"$dilHandler":0}',
    // JSON escapes spell the same keys, so they are refused too.
    '{"\\u0024dilHandler":0}',
    '{"a":[{"\\u005f_proto__":{}}]}',
    "undefined",
  ])
    expect(() => engine.evaluate(source)).toThrow("Waiting");
  // Evaluations requested in one task leave together, in one batch.
  await Promise.resolve();
  expect(started).toEqual(["expression runtime"]);
  engine.dispose();
});

it("keeps a bounded cache of parsed literals", () => {
  const engine = new ExpressionEngine();
  for (let index = 0; index < 1100; index++)
    expect(engine.read(String(index))).toBe(index);
  expect(engine.read("1")).toBe(1);
  expect(started).toEqual([]);
  engine.dispose();
});

it("seeds snapshot results only for canonical, pending expression keys", () => {
  const engine = new ExpressionEngine();
  const key = (source: string) => JSON.stringify([source, {}]);
  engine.seed({
    [key("total * 2")]: 84,
    [key("onPick")]: { $dilHandler: 7 },
    // Malformed keys, JSON literals and non-canonical spellings are skipped.
    "not a key": 1,
    [key("42")]: 0,
    '[ "spaced", {} ]': 3,
    [key("deep")]: JSON.parse("[".repeat(70) + "]".repeat(70)) as unknown,
  });
  expect(engine.read("total * 2")).toBe(84);
  expect(engine.read("42")).toBe(42);
  expect(engine.hasValue("spaced")).toBe(false);
  expect(engine.hasValue("deep")).toBe(false);
  expect(engine.isFresh("total * 2")).toBe(true);
  // A seeded callback does nothing until an evaluation confirms it.
  const pick = engine.read("onPick") as (argument: unknown) => unknown;
  expect(pick("a")).toBeUndefined();
  // A later seed never replaces a value that is already shown.
  engine.seed({ [key("total * 2")]: 1 });
  expect(engine.read("total * 2")).toBe(84);
  expect(engine.results()).toEqual({
    [key("total * 2")]: 84,
    [key("onPick")]: { $dilHandler: 7 },
  });
  expect(started).toEqual([]);
  engine.dispose();
});
