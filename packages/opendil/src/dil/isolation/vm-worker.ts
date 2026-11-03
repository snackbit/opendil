import {
  RELEASE_SYNC,
  newVariant,
  newQuickJSWASMModuleFromVariant,
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
const bytes = Uint8Array.from(atob(__DIL_WASM__), (c) => c.charCodeAt(0));
const ready = newQuickJSWASMModuleFromVariant(
  newVariant(RELEASE_SYNC, {
    wasmBinary: bytes.buffer,
    locateFile: () => "data:application/wasm;base64," + __DIL_WASM__,
  }),
).then((module) => {
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
});
interface Request {
  id: number;
  type: string;
  source?: string;
  scope?: Record<string, unknown>;
  handle?: number;
  argument?: unknown;
  gesture?: boolean;
  intent?: number;
  handles?: number[];
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
async function execute(request: Request) {
  const vm = await ready.catch(() => {
    throw new RuntimeFailure("QuickJS failed to start");
  });
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
self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  sequence = sequence.then(async () => {
    try {
      if (failure) throw new RuntimeFailure(failure);
      self.postMessage(await execute(request));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.slice(0, 2048)
          : "Isolated evaluation failed";
      if (error instanceof RuntimeFailure) {
        failure = message;
        self.postMessage({ id: request.id, revision, fatal: message });
      } else self.postMessage({ id: request.id, revision, error: message });
    }
  });
};
