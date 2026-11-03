import { readFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { afterEach, expect, it } from "vitest";
import { DilParser } from "../../packages/opendil/src/dil/parser/dil-parser";
import {
  ICONS,
  SVG_ELEMENTS,
} from "../../packages/opendil/src/dil/widgets/primitives/vocabulary";
import {
  extractApi,
  documentedApi,
  compareApi,
  compositionErrors,
} from "../../scripts/agent-spec-api.mjs";

const files = ["genui.agent.md", "genui.agent.full.md", "genui.examples.md"];
const primary = readFileSync("spec/genui.agent.md", "utf8");
it("documents icon and SVG element allowlists", () => {
  for (const name of Object.keys(ICONS)) expect(primary).toContain(name);
  for (const name of SVG_ELEMENTS)
    expect(primary).toMatch(new RegExp("\\b" + name + "\\b"));
});
const workers: Worker[] = [];
afterEach(async () => {
  await Promise.all(workers.splice(0).map((w) => w.terminate()));
});
function vm() {
  const code = readFileSync("packages/opendil/dist/runtime/vm.js", "utf8");
  const worker = new Worker(
    `const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=v=>parentPort.postMessage(v);${code};parentPort.on('message',data=>self.onmessage({data}));`,
    { eval: true },
  );
  workers.push(worker);
  let id = 0;
  return (type: string, payload: Record<string, unknown>) =>
    new Promise<Record<string, unknown>>((resolve) => {
      const current = ++id;
      const receive = (reply: Record<string, unknown>) => {
        if (reply.id === current) {
          worker.off("message", receive);
          resolve(reply);
        }
      };
      worker.on("message", receive);
      worker.postMessage({ id: current, type, ...payload });
    });
}
it("documents exactly the stock dispatch and consumed props", () => {
  const { api, layout } = extractApi();
  expect(compareApi(api, documentedApi(primary, layout))).toEqual([]);
});
it("detects missing and invented APIs", () => {
  const actual = new Map([["slider", new Set(["value"])]]);
  expect(compareApi(actual, new Map([["fake", new Set()]]))).toEqual([
    "Undocumented component: slider",
    "Nonexistent component: fake",
  ]);
  expect(
    compareApi(actual, new Map([["slider", new Set(["defaultValue"])]])),
  ).toEqual([
    "Missing property: slider.value",
    "Unsupported property: slider.defaultValue",
  ]);
});
it("rejects invalid composition and malformed syntax", () => {
  const parser = new DilParser();
  const batch = parser.append("<table><text>Wrong child</text></table>", true);
  expect(compositionErrors(parser.snapshot(), batch.links, primary)).toEqual([
    "table cannot contain text",
  ]);
  const invalid = new DilParser();
  invalid.append("<box value={", true);
  expect(invalid.snapshot().some((n) => n.status === "error")).toBe(true);
});
it("rejects invalid VM expressions and automatic clipboard actions", async () => {
  const send = vm();
  expect((await send("evaluate", { source: "1 +" })).error).toBeTruthy();
  expect(
    (await send("evaluate", { source: 'GenUI.copy("automatic")' })).error,
  ).toContain("gesture");
});
const examples = files.flatMap((file) =>
  [
    ...readFileSync("spec/" + file, "utf8").matchAll(/```dil\n([\s\S]*?)```/g),
  ].map((m, i) => ({ name: file + ":" + i, source: m[1] ?? "" })),
);
if (process.env.GENUI_RESPONSE_FILE)
  examples.push({
    name: "generated response",
    source: readFileSync(process.env.GENUI_RESPONSE_FILE, "utf8"),
  });
for (const example of examples)
  it("validates " + example.name, async () => {
    const parser = new DilParser();
    const batch = parser.append(example.source, true);
    expect(parser.snapshot().filter((n) => n.status === "error")).toEqual([]);
    expect(compositionErrors(parser.snapshot(), batch.links, primary)).toEqual(
      [],
    );
    const send = vm();
    for (const declaration of batch.declarations)
      expect(
        (await send("declare", { source: declaration })).error,
      ).toBeUndefined();
    const { api, svgProps } = extractApi();
    const walk = async (
      id: number,
      scope: Record<string, unknown>,
      svg = false,
    ): Promise<void> => {
      const node = parser.snapshot().find((n) => n.id === id);
      if (!node) throw new Error("Missing parsed node");
      if (node.kind === "element") {
        expect(
          api.has(node.name) ||
            node.name === "svg" ||
            (svg && SVG_ELEMENTS.has(node.name)),
          "Unsupported component " + node.name,
        ).toBe(true);
        for (const prop of Object.keys(node.attributes))
          expect(
            (svg || node.name === "svg" ? svgProps : api.get(node.name))?.has(
              prop,
            ),
            "Unsupported property " + node.name + "." + prop,
          ).toBe(true);
      }
      const evaluate = async (source: string) => {
        const reply = await send("evaluate", { source, scope });
        expect(reply.error, source).toBeUndefined();
        expect(reply.fatal).toBeUndefined();
        return reply.value;
      };
      for (const expression of node.expressions) await evaluate(expression);
      for (const [key, attr] of Object.entries(node.attributes))
        if (attr.expression && !(node.kind === "each" && key === "items"))
          await evaluate(attr.expression);
      const children = batch.links
        .filter((l) => l.parent === id)
        .map((l) => l.child);
      if (node.kind === "each") {
        const itemsSource = node.attributes.items?.expression;
        const itemName = node.attributes.item?.literal;
        const indexName = node.attributes.index?.literal;
        if (!itemsSource || typeof itemName !== "string")
          throw new Error("Invalid iteration");
        const items = await evaluate(itemsSource);
        expect(Array.isArray(items)).toBe(true);
        if (Array.isArray(items))
          for (const [i, item] of items.entries()) {
            const local = {
              ...scope,
              [itemName]: item,
            };
            if (typeof indexName === "string" && indexName)
              local[indexName] = i;
            for (const child of children) await walk(child, local, svg);
          }
      } else
        for (const child of children)
          await walk(child, scope, svg || node.name === "svg");
    };
    await walk(0, {});
    const fragmented = new DilParser();
    for (const c of example.source) fragmented.append(c, false);
    fragmented.append("", true);
    expect(fragmented.snapshot()).toEqual(parser.snapshot());
  });
