import type { DilRenderErrorCode } from "../render-error";
import { inlineWorkerFactory } from "./inline-worker-hook";
/**
 * Host and Shadow DOM renderers run the parser and the QuickJS runtime in blob:
 * workers, which inherit the page's Content Security Policy. When that policy
 * blocks them, readers get a plain explanation and developers get the directives
 * to add, instead of a generic crash message.
 */
export const POLICY_BLOCKED_MESSAGE =
  "This content can't be displayed because this page's security policy blocks it.";
export const WASM_BLOCKED_MESSAGE =
  "Interactive parts of this content can't run because this page's security policy blocks them.";
/** Name of the Trusted Types policy that turns OpenDIL's own blob: URLs into script URLs. */
export const TRUSTED_TYPES_POLICY = "opendil";
const REQUIRED_DIRECTIVES = `"worker-src blob:" and "script-src 'wasm-unsafe-eval'"`;
// A blocked blob: worker is reported against one of these directives, depending on fallbacks.
const WORKER_DIRECTIVES = new Set([
  "worker-src",
  "child-src",
  "script-src",
  "script-src-elem",
  "default-src",
]);
/** Load failures are reported within this window, long before it ends. */
const WATCH_WINDOW_MS = 3000;
/**
 * The isolated frame is a sandboxed, opaque-origin document that declares its
 * own policy. A failure there means a second policy, usually the application's
 * header, was applied to the frame document as well.
 */
function advice() {
  const framed =
    typeof window !== "undefined" &&
    window.origin === "null" &&
    window.parent !== window;
  return framed
    ? "This happened inside OpenDIL's isolated frame, which declares its own policy in frame.html. " +
        "Do not apply the application's Content-Security-Policy header to the OpenDIL runtime files."
    : `mode="host" and mode="shadow" need ${REQUIRED_DIRECTIVES}. ` +
        "The default isolated mode applies its own policy inside its frame; the page only needs to allow that frame (frame-src).";
}
const reported = new Set<string>();
/** One renderer per chat message would otherwise repeat the same diagnosis. */
function report(diagnostic: string) {
  if (reported.has(diagnostic)) return;
  reported.add(diagnostic);
  console.error(diagnostic);
}
interface ScriptURLPolicy {
  createScriptURL(url: string): unknown;
}
interface TrustedTypesFactory {
  createPolicy(
    name: string,
    rules: { createScriptURL(url: string): string },
  ): ScriptURLPolicy;
}
function trustedTypes() {
  return (globalThis as { trustedTypes?: TrustedTypesFactory }).trustedTypes;
}
let scriptPolicy: ScriptURLPolicy | null | undefined;
/**
 * Pages that enforce Trusted Types reject plain strings as worker URLs. The
 * policy object stays private to this module and only passes blob: URLs.
 */
function workerURL(url: string): string {
  const factory = trustedTypes();
  if (!factory) return url;
  if (scriptPolicy === undefined) {
    try {
      scriptPolicy = factory.createPolicy(TRUSTED_TYPES_POLICY, {
        createScriptURL(value) {
          if (!value.startsWith("blob:"))
            throw new TypeError("OpenDIL only creates blob: worker URLs.");
          return value;
        },
      });
    } catch {
      // The page's trusted-types directive does not allow this policy name.
      scriptPolicy = null;
    }
  }
  return scriptPolicy ? (scriptPolicy.createScriptURL(url) as string) : url;
}
export interface InlineWorkerOptions<Message> {
  /** Names the worker in developer diagnostics. */
  role: string;
  /** Reader-safe message for failures the page policy does not explain. */
  crashMessage: string;
  /** Reported with crashMessage. */
  crashCode: DilRenderErrorCode;
  onMessage: (data: Message) => void;
  /** Receives one reader-safe message when the worker cannot start or stops. */
  onStop: (message: string, code: DilRenderErrorCode) => void;
}
export interface InlineWorker {
  /** Null when the browser refused to construct the worker. */
  readonly worker: Worker | null;
  /** Terminates the worker without reporting a failure. */
  dispose(): void;
}
/** A worker that the testing helper refuses is reported like a blocked one, without console advice. */
export const REPLACED_WORKER_MESSAGE =
  "This part can't run here: @snackbit/opendil/testing provides no expression runtime.";
type Cause = "policy" | "trusted-types" | "replaced" | undefined;
function blobWorker(
  source: string,
  role: string,
  stop: (cause: Cause) => void,
): Worker | null {
  const url = URL.createObjectURL(
    new Blob([source], { type: "text/javascript" }),
  );
  try {
    return new Worker(workerURL(url));
  } catch (error) {
    let cause: Cause;
    if (error instanceof DOMException && error.name === "SecurityError")
      cause = "policy";
    else if (error instanceof TypeError && trustedTypes())
      cause = "trusted-types";
    else console.error(`OpenDIL: could not start the ${role} worker.`, error);
    queueMicrotask(() => stop(cause));
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function startInlineWorker<Message>(
  source: string,
  {
    role,
    crashMessage,
    crashCode,
    onMessage,
    onStop,
  }: InlineWorkerOptions<Message>,
): InlineWorker {
  // A blob: policy report seen while the worker loads; consulted only for load failures.
  let blocked = false;
  let started = false;
  let settled = false;
  const page = typeof document === "undefined" ? undefined : document;
  const watch = (event: Event) => {
    const violation = event as SecurityPolicyViolationEvent;
    if (
      /^blob(:|$)/.test(violation.blockedURI) &&
      WORKER_DIRECTIVES.has(violation.effectiveDirective)
    )
      blocked = true;
  };
  page?.addEventListener("securitypolicyviolation", watch);
  const watchTimer = setTimeout(unwatch, WATCH_WINDOW_MS);
  function unwatch() {
    clearTimeout(watchTimer);
    page?.removeEventListener("securitypolicyviolation", watch);
  }
  const stop = (cause: Cause) => {
    unwatch();
    if (settled) return;
    settled = true;
    if (cause === "policy")
      report(
        `OpenDIL: this page's Content Security Policy blocked the ${role} worker. ${advice()}`,
      );
    if (cause === "trusted-types")
      report(
        `OpenDIL: this page's Trusted Types policy blocked the ${role} worker. ` +
          `Allow OpenDIL's policy with "trusted-types ${TRUSTED_TYPES_POLICY}" ` +
          `(add 'allow-duplicates' if more than one copy of OpenDIL runs on the page). ${advice()}`,
      );
    if (cause === "replaced")
      onStop(REPLACED_WORKER_MESSAGE, "worker-blocked-policy");
    else if (cause) onStop(POLICY_BLOCKED_MESSAGE, "worker-blocked-policy");
    else onStop(crashMessage, crashCode);
  };
  const replacement = inlineWorkerFactory()?.(role);
  let worker: Worker | null = null;
  // Owners attach their listeners after construction.
  if (replacement === "blocked") queueMicrotask(() => stop("replaced"));
  else if (replacement) worker = replacement as unknown as Worker;
  else worker = blobWorker(source, role, stop);
  if (worker) {
    worker.onmessage = (event: MessageEvent<Message>) => {
      if (!started) {
        started = true;
        unwatch();
      }
      onMessage(event.data);
    };
    worker.onerror = (event?: Event) => {
      const message = (event as ErrorEvent | undefined)?.message;
      // Script errors carry a message, and a running worker has replied: both
      // are crashes. A worker that never loaded reports a bare event, and the
      // policy report for it may be dispatched just after.
      if (started || (typeof message === "string" && message !== ""))
        stop(undefined);
      else setTimeout(() => stop(blocked ? "policy" : undefined), 0);
    };
  }
  return {
    worker,
    dispose() {
      settled = true;
      unwatch();
      worker?.terminate();
    },
  };
}
/** quickjs-emscripten could not instantiate its WebAssembly module (see vm-worker.ts). */
export const RUNTIME_START_FAILURE = "QuickJS failed to start";
/**
 * Returns a reader-safe message when the page policy forbids WebAssembly
 * compilation, which blob: workers inherit; otherwise undefined.
 */
export function explainRuntimeStartFailure(): string | undefined {
  if (typeof WebAssembly === "undefined") return undefined;
  try {
    // The smallest valid module: magic number and version.
    new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    return undefined;
  } catch {
    report(
      `OpenDIL: this page's Content Security Policy blocks WebAssembly, so document expressions cannot run. ${advice()}`,
    );
    return WASM_BLOCKED_MESSAGE;
  }
}
