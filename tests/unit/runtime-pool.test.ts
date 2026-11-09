import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  INLINE_WORKER_HOOK,
  type InlineWorkerPort,
} from "../../packages/opendil/src/dil/runtime/inline-worker-hook";
import type * as RuntimePoolModule from "../../packages/opendil/src/dil/runtime/runtime-pool";

class FakePort implements InlineWorkerPort {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event?: Event) => void) | null = null;
  posted: unknown[] = [];
  terminated = false;
  constructor(readonly role: string) {}
  postMessage(message: unknown) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
  crash() {
    this.onerror?.(Object.assign(new Event("error"), { message: "Boom" }));
  }
}

let ports: FakePort[] = [];
/** A fresh module per test: the pool keeps the spare and module page-wide. */
let pool: typeof RuntimePoolModule;
// The smallest valid module: magic number and version.
const wasmModule = () =>
  new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));

beforeEach(async () => {
  ports = [];
  vi.stubGlobal("__DIL_VM_WORKER__", "");
  vi.stubGlobal(INLINE_WORKER_HOOK, (role: string) => {
    const port = new FakePort(role);
    ports.push(port);
    return port;
  });
  vi.resetModules();
  pool = await import("../../packages/opendil/src/dil/runtime/runtime-pool");
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it("boots one spare that the next document adopts, then boots the next spare", () => {
  pool.warmExpressionRuntime();
  pool.warmExpressionRuntime();
  expect(ports).toHaveLength(1);
  expect(ports[0]?.role).toBe("expression runtime");
  expect(ports[0]?.posted).toEqual([{ type: "init", share: true }]);

  const adopted = pool.adoptRuntime();
  expect(adopted.worker.worker).toBe(ports[0]);
  expect(ports).toHaveLength(2);

  // The adopter takes the spare's messages once it owns the route.
  const received: unknown[] = [];
  adopted.route.onMessage = (data) => received.push(data);
  ports[0]?.reply({ type: "result", id: 1 });
  ports[0]?.reply(null);
  expect(received).toEqual([{ type: "result", id: 1 }, null]);
});

it("starts a runtime directly when no spare is waiting", () => {
  const runtime = pool.adoptRuntime();
  expect(runtime.worker.worker).toBe(ports[0]);
  expect(ports).toHaveLength(1);
  // Until its owner routes it, a stop goes nowhere and boots no spare.
  ports[0]?.reply({ type: "ready" });
  expect(() => ports[0]?.crash()).not.toThrow();
  expect(ports).toHaveLength(1);
});

it("hands the first compiled module to later runtimes without routing it", () => {
  const first = pool.adoptRuntime();
  const received: unknown[] = [];
  first.route.onMessage = (data) => received.push(data);
  const module = wasmModule();
  ports[0]?.reply({ type: "module", module });
  // Only the first module is kept.
  ports[0]?.reply({ type: "module", module: wasmModule() });
  expect(received).toEqual([]);

  pool.adoptRuntime();
  expect(ports[1]?.posted).toEqual([{ type: "init", module }]);
  // A module message without a compiled module is an ordinary message.
  ports[0]?.reply({ type: "module", module: "not compiled" });
  expect(received).toEqual([{ type: "module", module: "not compiled" }]);
});

it("drops a spare that stops before adoption and starts a fresh runtime later", () => {
  pool.warmExpressionRuntime();
  ports[0]?.reply({ type: "ready" });
  ports[0]?.crash();
  expect(ports[0]?.terminated).toBe(true);

  const runtime = pool.adoptRuntime();
  expect(runtime.worker.worker).toBe(ports[1]);
  expect(ports).toHaveLength(2);
});

it("keeps the current spare when an adopted runtime still on the spare route stops", () => {
  pool.warmExpressionRuntime();
  pool.adoptRuntime();
  ports[0]?.reply({ type: "ready" });
  ports[0]?.crash();
  expect(ports[0]?.terminated).toBe(true);

  // The spare booted at adoption is still the one the next document takes.
  expect(pool.adoptRuntime().worker.worker).toBe(ports[1]);
});
