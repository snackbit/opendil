import {
  RELEASE_SYNC,
  newVariant,
  newQuickJSWASMModuleFromVariant,
  type QuickJSWASMModule,
} from "quickjs-emscripten";
/** A host exception escaped QuickJS; its interpreter state is no longer trustworthy. */
class RuntimeFailure extends Error {}
function guard<T>(action: () => T): T {
  try {
    return action();
  } catch (error) {
    throw new RuntimeFailure(
      error instanceof Error ? error.message : "Isolated runtime failed",
    );
  }
}
// The build inlines __DIL_WASM__ at each use, so it is read once.
const encoded = __DIL_WASM__;
function decode() {
  const native = (
    Uint8Array as { fromBase64?: (text: string) => Uint8Array<ArrayBuffer> }
  ).fromBase64;
  if (native) return native(encoded);
  const text = atob(encoded);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++)
    bytes[index] = text.charCodeAt(index);
  return bytes;
}
/**
 * Every document runs its own worker. The first compiles the embedded module
 * and hands it to the page, which passes it to later workers in their first
 * message, so they skip decoding and compiling about 500 KB of WebAssembly.
 */
async function compile(shared: WebAssembly.Module | undefined, share: boolean) {
  if (shared) return shared;
  const module = await WebAssembly.compile(decode());
  if (share) self.postMessage({ type: "module", module });
  return module;
}
function setup(module: QuickJSWASMModule) {
  const runtime = module.newRuntime();
  runtime.setMemoryLimit(64 * 1024 * 1024);
  // QuickJS must detect recursion before the browser's native stack does: a host
  // RangeError unwinds the wasm interpreter without restoring its stack or GC state.
  // Chromium workers overflow natively above roughly 80 KiB of QuickJS stack; any
  // remaining host overflow (for example nested JSON.stringify) is reported as fatal.
  runtime.setMaxStackSize(64 * 1024);
  // QuickJS polls this handler about every 10,000 interpreter steps. Limit each
  // evaluation by that work, not elapsed time, so a slow or busy device never stops a
  // document that a faster one completes. 256 polls end runaway loops within roughly
  // 20-250 ms on a desktop CPU, while encoding 5,000 records takes about 11. The
  // execution queue's 1 s transport timeout still bounds native work that never polls.
  let polls = 0;
  runtime.setInterruptHandler(() => ++polls > 256);
  const context = runtime.newContext();
  let copied = "";
  let gesture = false;
  const format = context.newFunction("__format", (value) =>
    context.newString(
      new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
        context.getNumber(value),
      ),
    ),
  );
  context.setProp(context.global, "__format", format);
  format.dispose();
  const copy = context.newFunction("__copy", (value) => {
    if (!gesture) throw new Error("Clipboard requires a user gesture");
    const text = context.getString(value);
    if (text.length > 65536) throw new Error("Clipboard payload too large");
    copied = text;
    return context.undefined;
  });
  context.setProp(context.global, "__copy", copy);
  copy.dispose();
  function run(code: string) {
    polls = 0;
    const result = guard(() => context.evalCode(code));
    if (!result.error) return result.value;
    const failed = result.error;
    const error = guard(() => context.dump(failed));
    failed.dispose();
    throw new Error(
      typeof error?.message === "string"
        ? error.message
        : "Isolated execution failed",
    );
  }
  /** Reads a string result without invoking authored conversions. */
  function text(code: string) {
    const value = run(code);
    try {
      if (guard(() => context.typeof(value)) !== "string")
        throw new Error("Isolated execution returned an invalid result");
      return guard(() => context.getString(value));
    } finally {
      value.dispose();
    }
  }
  run(
    `globalThis.__states={};globalThis.__handlers=[];globalThis.__freeHandles=[];globalThis.__encodedHandles=new Set();globalThis.__handlerIds=new WeakMap();globalThis.__setters=new WeakMap();globalThis.__reads=new Set();globalThis.__writes=new Set();globalThis.__changed=false;globalThis.Intl={NumberFormat:function(){return {format:__format}}};globalThis.GenUI={copy:__copy};globalThis.__encode=v=>{const depth=new WeakMap();return JSON.stringify(v,function(_k,v){const d=(depth.get(this)??0)+1;if(d>65)throw new RangeError('Message output exceeds structural limits');if(v!==null&&typeof v==='object')depth.set(v,d);if(typeof v!=='function')return v;let id=__handlerIds.get(v);if(id===undefined||__handlers[id]!==v){id=__freeHandles.length?__freeHandles.pop():__handlers.length;__handlers[id]=v;__handlerIds.set(v,id)}__encodedHandles.add(id);return {$dilHandler:id,$dilSetter:__setters.get(v)}})??'null'};`,
  ).dispose();
  return {
    run,
    text,
    reset() {
      copied = "";
    },
    getCopy() {
      return copied;
    },
    setGesture(value: boolean) {
      gesture = value;
    },
  };
}
type VM = ReturnType<typeof setup>;
let ready: Promise<VM> | undefined;
function boot(shared?: WebAssembly.Module, share = false) {
  ready ??= compile(shared, share)
    .then((wasmModule) =>
      newQuickJSWASMModuleFromVariant(newVariant(RELEASE_SYNC, { wasmModule })),
    )
    .then(setup);
  return ready;
}
interface Request {
  id: number;
  type: string;
  key?: string;
  source?: string;
  scope?: Record<string, unknown>;
  handle?: number;
  argument?: unknown;
  gesture?: boolean;
  intent?: number;
  handles?: number[];
  /** A batch: declarations and releases, then evaluations. */
  steps?: Request[];
  evaluations?: Request[];
  /**
   * A call: retained evaluations with the bindings they last read. Those that
   * read a binding the call wrote are evaluated again in the same turn.
   */
  dependents?: Array<Request & { dependencies?: string[] }>;
}
function declaration(source: string) {
  const state =
    /^const\s*\[\s*(\w+)\s*,\s*(\w+)\s*\]\s*=\s*DIL\.useState\(([\s\S]*)\)\s*;?$/.exec(
      source,
    );
  const derived = /^const\s+(\w+)\s*=([\s\S]*)$/.exec(source);
  if (state) {
    const [, name, setter, initializer] = state;
    return `if(!Object.hasOwn(__states,${JSON.stringify(name)})){let v=(${initializer});__states[${JSON.stringify(name)}]=typeof v==='function'?v():v;Object.defineProperty(globalThis,${JSON.stringify(name)},{get:()=>{__reads.add(${JSON.stringify(name)});return __states[${JSON.stringify(name)}]}});globalThis[${JSON.stringify(setter)}]=v=>{__states[${JSON.stringify(name)}]=typeof v==='function'?v(__states[${JSON.stringify(name)}]):v;__writes.add(${JSON.stringify(name)});__changed=true;};__setters.set(globalThis[${JSON.stringify(setter)}],${JSON.stringify(name)})}`;
  }
  if (derived)
    return `Object.defineProperty(globalThis,${JSON.stringify(derived[1])},{configurable:true,get:()=>(${derived[2]?.replace(/;\s*$/, "")})})`;
  throw new Error("Expected a document const declaration");
}
function expression(request: Request) {
  if (request.type === "call")
    return `__encode(__handlers[${Number(request.handle)}](${JSON.stringify(request.argument) ?? "undefined"}))`;
  const scope = request.scope ?? {};
  if (Object.keys(scope).some((k) => !/^[$A-Z_a-z][$\w]*$/.test(k)))
    throw new Error("Invalid scope");
  return `__encode((function(){const {${Object.keys(scope).join(",")}}=${JSON.stringify(scope)};return (${request.source});})())`;
}
let sequence = Promise.resolve();
let revision = 0;
let failure = "";
function message(error: unknown) {
  return error instanceof Error
    ? error.message.slice(0, 2048)
    : "Isolated evaluation failed";
}
/** One job of a batch; a runtime failure still stops the whole worker. */
function attempt(vm: VM, request: Request): Record<string, unknown> {
  try {
    return execute(vm, request);
  } catch (error) {
    if (error instanceof RuntimeFailure) throw error;
    return { revision, error: message(error) };
  }
}
/** Interrupted work halts the document, so the rest of its batch is skipped. */
function interrupted(result: Record<string, unknown>) {
  return result.error === "interrupted";
}
function batch(vm: VM, request: Request) {
  const steps: Record<string, unknown>[] = [];
  const results: Record<string, unknown>[] = [];
  for (const step of request.steps ?? []) {
    const result = attempt(vm, step);
    steps.push(result);
    if (interrupted(result)) return { id: request.id, revision, steps };
  }
  for (const evaluation of request.evaluations ?? []) {
    const result = attempt(vm, { ...evaluation, type: "evaluate" });
    results.push({ ...result, key: evaluation.key });
    if (interrupted(result)) break;
  }
  return { id: request.id, revision, steps, results };
}
function call(vm: VM, request: Request) {
  const reply = execute(vm, request);
  const written = reply.changed === true && Array.isArray(reply.bindings);
  const bindings = new Set(written ? (reply.bindings as string[]) : []);
  const results: Record<string, unknown>[] = [];
  if (reply.changed === true)
    for (const dependent of request.dependents ?? []) {
      if (
        written &&
        dependent.dependencies &&
        !dependent.dependencies.some((name) => bindings.has(name))
      )
        continue;
      const result = attempt(vm, { ...dependent, type: "evaluate" });
      results.push({ ...result, key: dependent.key });
      if (interrupted(result)) break;
    }
  return { ...reply, results };
}
function respond(vm: VM, request: Request) {
  if (request.type === "batch") return batch(vm, request);
  if (request.type === "call") return call(vm, request);
  return execute(vm, request);
}
function execute(vm: VM, request: Request): Record<string, unknown> {
  if (request.type === "release") {
    vm.run(
      `for(const id of ${JSON.stringify(request.handles ?? [])}){if(__handlers[id]!==undefined){__handlers[id]=undefined;__freeHandles.push(id)}}`,
    ).dispose();
    return { id: request.id };
  }
  vm.reset();
  vm.setGesture(request.type === "call" && request.gesture === true);
  if (request.type === "call")
    revision = Math.max(revision, request.intent ?? 0);
  vm.run(
    "__reads.clear();__writes.clear();__encodedHandles.clear();__changed=false",
  ).dispose();
  if (request.type === "declare") {
    vm.run(declaration(request.source ?? "")).dispose();
    return { id: request.id, changed: true, revision };
  }
  const encoded = vm.text(expression(request));
  if (encoded.length > 524288) throw new Error("Message result limit exceeded");
  const metadata = vm.text(
    "JSON.stringify({changed:__changed===true,dependencies:[...__reads],bindings:[...__writes],handles:[...__encodedHandles]})",
  );
  if (metadata.length > 524288)
    throw new Error("Message dependency limit exceeded");
  const parsed: unknown = JSON.parse(metadata);
  const fields: Record<string, unknown> =
    parsed && typeof parsed === "object" ? { ...parsed } : {};
  // Authored code can replace VM globals, so name every reply field explicitly.
  return {
    id: request.id,
    value: encoded ? (JSON.parse(encoded) as unknown) : null,
    changed: fields.changed === true,
    revision,
    dependencies: fields.dependencies,
    bindings: fields.bindings,
    handles: fields.handles,
    copy: vm.getCopy(),
  };
}
self.onmessage = (
  event: MessageEvent<Request & { module?: unknown; share?: boolean }>,
) => {
  const request = event.data;
  // The page's first message passes the module it already holds, or asks for
  // the one this worker compiles. A spare worker boots before it has work.
  if (request.type === "init") {
    void boot(
      request.module instanceof WebAssembly.Module ? request.module : undefined,
      request.share === true,
    ).catch(() => {});
    return;
  }
  sequence = sequence.then(async () => {
    try {
      if (failure) throw new RuntimeFailure(failure);
      const vm = await boot().catch(() => {
        throw new RuntimeFailure("QuickJS failed to start");
      });
      self.postMessage({ ...respond(vm, request), id: request.id });
    } catch (error) {
      const reason = message(error);
      if (error instanceof RuntimeFailure) {
        failure = reason;
        self.postMessage({ id: request.id, revision, fatal: reason });
      } else self.postMessage({ id: request.id, revision, error: reason });
    }
  });
};
