import { readFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { afterEach, describe, it, expect } from "vitest";
const workers: Worker[] = [];
interface Reply {
  id: number;
  value?: unknown;
  error?: string;
  fatal?: string;
  changed?: boolean;
  dependencies?: unknown;
}
afterEach(async () => {
  await Promise.all(workers.splice(0).map((worker) => worker.terminate()));
});
function runtime() {
  const source = readFileSync("packages/opendil/dist/runtime/vm.js", "utf8");
  const worker = new Worker(
    `const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=value=>parentPort.postMessage(value);${source};parentPort.on('message',data=>self.onmessage({data}));`,
    { eval: true },
  );
  workers.push(worker);
  let id = 0;
  return (type: string, payload: Record<string, unknown> = {}) =>
    new Promise<Reply>((resolve) => {
      const current = ++id;
      const receive = (reply: Reply) => {
        if (reply.id === current) {
          worker.off("message", receive);
          resolve(reply);
        }
      };
      worker.on("message", receive);
      worker.postMessage({ id: current, type, ...payload });
    });
}
describe("isolated execution worker", () => {
  it("rejects allocations beyond the per-message VM heap", async () => {
    const send = runtime();
    expect(
      (await send("evaluate", { source: "new Uint8Array(100*1024*1024)" }))
        .error,
    ).toBeTruthy();
    expect((await send("evaluate", { source: "1+1" })).value).toBe(2);
  });
  it("keeps declarations and functional updates inside its VM", async () => {
    const send = runtime();
    expect(
      (await send("declare", { source: "const [n,setN]=DIL.useState(2)" }))
        .changed,
    ).toBe(true);
    await send("declare", { source: "const total=n*3" });
    expect((await send("evaluate", { source: "total" })).value).toBe(6);
    const result = await send("evaluate", { source: "()=>setN(v=>v+1)" });
    const value = result.value;
    if (!value || typeof value !== "object" || !("$dilHandler" in value))
      throw new Error("Missing callback");
    await send("call", { handle: value.$dilHandler });
    expect((await send("evaluate", { source: "total" })).value).toBe(9);
  });
  it.each([
    "window",
    "document",
    "parent",
    "fetch",
    "localStorage",
    "process",
    "require",
  ])("does not expose %s", async (name) => {
    const send = runtime();
    expect((await send("evaluate", { source: `typeof ${name}` })).value).toBe(
      "undefined",
    );
  });
  it("interrupts infinite authored code and still answers later evaluations", async () => {
    const send = runtime();
    expect(
      (await send("evaluate", { source: "(()=>{while(true){}})()" })).error,
    ).toBeTruthy();
    expect((await send("evaluate", { source: "1+1" })).value).toBe(2);
  });
  it("separates messages and prevents clipboard calls without a gesture", async () => {
    const a = runtime(),
      b = runtime();
    await a("declare", { source: "const secret=42" });
    expect((await b("evaluate", { source: "secret" })).error).toBeTruthy();
    expect(
      (await a("evaluate", { source: 'GenUI.copy("bad")' })).error,
    ).toContain("gesture");
  });
  it("stops runaway recursion inside QuickJS and keeps the VM consistent", async () => {
    // A host stack overflow would unwind the interpreter without QuickJS cleanup.
    const send = runtime();
    await send("declare", { source: "const [n,setN]=DIL.useState(1)" });
    for (const source of [
      "(function f(){return f()+1})()",
      "(()=>{let a=[];for(let i=0;i<1e5;i++)a=[a];return String(a)})()",
      "JSON.parse('['.repeat(1e5)+']'.repeat(1e5))",
    ])
      for (let attempt = 0; attempt < 4; attempt++) {
        const reply = await send("evaluate", { source });
        expect(reply.fatal).toBeUndefined();
        expect(reply.error).toContain("stack overflow");
      }
    expect(
      (await send("evaluate", { source: "n+[1,2].map(x=>x*2)" })).value,
    ).toBe("12,4");
  });
  it("names reply fields explicitly when authored code replaces VM globals", async () => {
    const send = runtime();
    const forged =
      '{"id":999,"error":"forged","fatal":"forged","dependencies":["x"]}';
    const reply = await send("evaluate", {
      source: `(JSON.stringify=()=>${JSON.stringify(forged)}, 1)`,
    });
    expect(reply.id).not.toBe(999);
    expect(reply.error).toBeUndefined();
    expect(reply.fatal).toBeUndefined();
    expect(reply.value).toEqual(JSON.parse(forged));
    await send("evaluate", { source: "(globalThis.__encode=()=>42, 1)" });
    expect((await send("evaluate", { source: "1" })).error).toContain(
      "invalid result",
    );
  });
  it("supports scoped array expressions and formatting without browser objects", async () => {
    const send = runtime();
    expect(
      (
        await send("evaluate", {
          source: "items.map(n=>n*2)",
          scope: { items: [1, 2] },
        })
      ).value,
    ).toEqual([2, 4]);
    expect(
      (
        await send("evaluate", {
          source: 'new Intl.NumberFormat("en-US").format(12345)',
        })
      ).value,
    ).toBe("12,345");
  });
});
