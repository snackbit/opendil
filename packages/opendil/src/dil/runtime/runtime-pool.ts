import type { DilRenderErrorCode } from "../render-error";
import { startInlineWorker, type InlineWorker } from "./inline-worker";
/** Where a runtime worker's messages go; a spare's owner changes on adoption. */
interface Route {
  onMessage(data: unknown): void;
  onStop(message: string, code: DilRenderErrorCode): void;
}
export interface Runtime {
  worker: InlineWorker;
  route: Route;
}
/** The compiled QuickJS module, which the page's first runtime worker returns. */
let sharedModule: WebAssembly.Module | undefined;
/** A booted runtime the next document adopts; see warmExpressionRuntime(). */
let spare: Runtime | undefined;
function moduleMessage(data: unknown): WebAssembly.Module | undefined {
  if (typeof WebAssembly === "undefined" || !data || typeof data !== "object")
    return undefined;
  const module: unknown = Reflect.get(data, "module");
  return Reflect.get(data, "type") === "module" &&
    module instanceof WebAssembly.Module
    ? module
    : undefined;
}
function launch(): Runtime {
  const route: Route = { onMessage() {}, onStop() {} };
  const worker = startInlineWorker(__DIL_VM_WORKER__, {
    role: "expression runtime",
    crashMessage: "Message execution worker failed.",
    crashCode: "runtime-crashed",
    onMessage: (data: unknown) => {
      const module = moduleMessage(data);
      if (module) sharedModule ??= module;
      else route.onMessage(data);
    },
    onStop: (message, code) => route.onStop(message, code),
  });
  // The worker boots now, and returns the module it compiles unless it got one.
  worker.worker?.postMessage({
    type: "init",
    ...(sharedModule ? { module: sharedModule } : { share: true }),
  });
  return { worker, route };
}
/**
 * Boots one expression runtime ahead of the documents that need it. Each
 * document that adopts the spare starts the next one, so a page that renders
 * answers one after another never waits for QuickJS to start. A spare that
 * cannot start is dropped, and the document that needs a runtime reports why.
 */
export function warmExpressionRuntime() {
  if (spare) return;
  const runtime = launch();
  runtime.route.onStop = () => {
    if (spare === runtime) spare = undefined;
    runtime.worker.dispose();
  };
  spare = runtime;
}
/** Takes the spare runtime, or starts one, for a document that needs it. */
export function adoptRuntime(): Runtime {
  const adopted = spare;
  if (!adopted) return launch();
  spare = undefined;
  warmExpressionRuntime();
  return adopted;
}
