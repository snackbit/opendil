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
  executableExamples,
  sharedProps,
} from "../../scripts/agent-spec-api.mjs";

const files = ["genui.agent.md", "genui.agent.full.md", "genui.examples.md"];
const primary = readFileSync("spec/genui.agent.md", "utf8");
const full = readFileSync("spec/genui.agent.full.md", "utf8");
const catalog = readFileSync("spec/genui.examples.md", "utf8");
const inventory = extractApi();
const actual = new Map([...inventory.api, ["svg", inventory.svgProps]]);
const hierarchy = [
  "## 1. Output format and safety",
  "## 2. Syntax and parsing",
  "### Markdown",
  "### JavaScript expressions",
  "### State declarations",
  "### Conditional rendering",
  "## 3. Component API",
  "### Text components",
  "### Media components",
  "### Layout components",
  "### Input components",
  "## 4. Specialized components",
  "### Data-linked components",
  "### Links and citations",
  "### Embedded application blocks",
  "## 5. Visualizations",
  "### Images",
  "### Charts",
  "### Maps",
  "## 6. Interactivity",
  "### State management",
  "### Event callbacks",
  "### Data bindings",
  "### Host actions",
  "## 7. Assets",
  "### Icons",
];
it("keeps the requested hierarchy in every reference and the example catalog", () => {
  for (const markdown of [primary, full, catalog])
    expect(markdown.match(/^#{2,3} .+$/gm)).toEqual(hierarchy);
});
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
  const { layout, svgProps } = inventory;
  for (const markdown of [primary, full]) {
    expect(
      compareApi(actual, documentedApi(markdown, layout, svgProps)),
    ).toEqual([]);
    expect([...sharedProps(markdown, "layout")].sort()).toEqual(
      [...layout].sort(),
    );
    expect([...sharedProps(markdown, "SVG")].sort()).toEqual(
      [...svgProps].sort(),
    );
  }
});
it("has searchable runnable examples for every component and SVG element", () => {
  const examples = executableExamples(catalog, "genui.examples.md");
  const names = new Set<string>();
  for (const example of examples) {
    const parser = new DilParser();
    parser.append(example.source, true);
    for (const node of parser.snapshot())
      if (node.kind === "element") names.add(node.name);
  }
  for (const name of actual.keys()) {
    expect(catalog).toContain("#### Component: " + name + "\n");
    expect(names.has(name), name).toBe(true);
  }
  for (const name of SVG_ELEMENTS) {
    if (name !== "svg")
      expect(catalog).toContain("#### SVG element: " + name + "\n");
    expect(names.has(name), name).toBe(true);
  }
  for (const name of [
    "static-card",
    "controlled-counter",
    "conditional-status",
    "dynamic-list",
    "validation-form",
    "host-action",
    "external-data",
    "incomplete-stream",
  ])
    expect(
      examples.some((example) => example.name.endsWith("Task: " + name)),
      name,
    ).toBe(true);
  for (const name of [
    "table > table-row > table-cell",
    "popover > popover-trigger + popover-content",
    "carousel > carousel-item",
    "radio-group > radio",
    "svg > defs > linearGradient > stop",
  ])
    expect(
      examples.some((example) => example.name.endsWith("Composition: " + name)),
      name,
    ).toBe(true);
});
it("reads nested prop types and reports duplicate definitions", () => {
  const signature =
    "- <slider>: marks?:{label:string,value?:number}[], value?:number; children: none";
  expect([
    ...(documentedApi(signature, new Set()).get("slider") ?? []),
  ]).toEqual(["marks", "value"]);
  expect(() => documentedApi(signature + "\n" + signature, new Set())).toThrow(
    "Duplicate component: slider",
  );
  expect(() =>
    documentedApi(
      "- <slider>: value?:number, value?:number; children: none",
      new Set(),
    ),
  ).toThrow("Duplicate property: slider.value");
  expect(() =>
    documentedApi("- <slider>: nonsense; children: none", new Set()),
  ).toThrow("Invalid property");
  expect(() => documentedApi("#### Component: slider\n", new Set())).toThrow(
    "Missing property block",
  );
  expect(() => sharedProps("", "layout")).toThrow("Missing shared props");
});
it("extracts nested Markdown fences with heading and line diagnostics", () => {
  expect(
    executableExamples(
      "# Example\n\n````dil\n```mermaid\nflowchart LR\nA --> B\n```\n````\n",
      "sample.md",
    ),
  ).toEqual([
    {
      name: "sample.md:3: Example",
      source: "```mermaid\nflowchart LR\nA --> B\n```\n",
    },
  ]);
  expect(() =>
    executableExamples("```dil\n<text>unfinished fence</text>", "sample.md"),
  ).toThrow("sample.md:1: Unclosed DIL fence");
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
it.each([
  ["<input>Unexpected child</input>", ["input accepts no children"]],
  ['<radio value="x">Orphan</radio>', ["radio requires parent radio-group"]],
  [
    "<popover><popover-trigger/></popover>",
    ["popover-trigger requires one child"],
  ],
  [
    "<popover><popover-trigger><button>A</button><button>B</button></popover-trigger></popover>",
    ["popover-trigger requires one child"],
  ],
  ["<table>Unexpected text</table>", ["table cannot contain markdown"]],
  [
    "<button><box><input/></box></button>",
    ["button cannot contain interactive input"],
  ],
  [
    "<pressable><button>Nested</button></pressable>",
    ["pressable cannot contain interactive button"],
  ],
  [
    "<table>{#if true}<table-row><table-cell>Ready</table-cell></table-row>{/if}</table>",
    [],
  ],
  ["<svg><text><tspan>SVG text</tspan></text></svg>", []],
])("checks structural contracts for %s", (source, expected) => {
  const parser = new DilParser();
  const batch = parser.append(source, true);
  expect(compositionErrors(parser.snapshot(), batch.links, primary)).toEqual(
    expected,
  );
  expect(compositionErrors(parser.snapshot(), batch.links, full)).toEqual(
    expected,
  );
});
it("rejects invalid VM expressions and automatic clipboard actions", async () => {
  const send = vm();
  expect((await send("evaluate", { source: "1 +" })).error).toBeTruthy();
  expect(
    (await send("evaluate", { source: 'GenUI.copy("automatic")' })).error,
  ).toContain("gesture");
});
it.each([
  ["input", "onChange", "name", "Ada"],
  ["slider", "onChange", "level", 75],
  ["checkbox", "onChange", "done", true],
  ["radio-group", "onChange", "billing", "annual"],
  ["segmented-control", "onChange", "view", "details"],
  ["NodeGraph", "onSelect", "selectedId", "db"],
])(
  "executes the documented %s.%s callback",
  async (component, event, binding, argument) => {
    const example = executableExamples(catalog, "genui.examples.md").find(
      (entry) =>
        entry.name.endsWith("Component: " + component) ||
        (component === "radio-group" &&
          entry.name.endsWith("Composition: radio-group > radio")),
    );
    if (!example) throw new Error("Missing callback example: " + component);
    const parser = new DilParser();
    const batch = parser.append(example.source, true);
    const send = vm();
    for (const source of batch.declarations)
      expect((await send("declare", { source })).error).toBeUndefined();
    const callback = parser.snapshot().find((node) => node.name === component)
      ?.attributes[event]?.expression;
    if (!callback)
      throw new Error("Missing callback: " + component + "." + event);
    const reply = await send("evaluate", { source: callback });
    const handle = reply.value;
    if (!handle || typeof handle !== "object" || !("$dilHandler" in handle))
      throw new Error("Callback did not compile");
    expect(
      (await send("call", { handle: handle.$dilHandler, argument })).error,
    ).toBeUndefined();
    expect((await send("evaluate", { source: binding })).value).toBe(argument);
  },
);
it("copies only when a compiled action is called with a gesture", async () => {
  const send = vm();
  const reply = await send("evaluate", {
    source: '() => GenUI.copy("Intentional copy")',
  });
  const handle = reply.value;
  if (!handle || typeof handle !== "object" || !("$dilHandler" in handle))
    throw new Error("Action did not compile");
  expect(
    (await send("call", { handle: handle.$dilHandler, gesture: false })).error,
  ).toContain("gesture");
  const result = await send("call", {
    handle: handle.$dilHandler,
    gesture: true,
  });
  expect(result.error).toBeUndefined();
  expect(result.copy).toBe("Intentional copy");
});
const examples = files.flatMap((file) =>
  executableExamples(readFileSync("spec/" + file, "utf8"), file),
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
    const { api, svgProps } = inventory;
    const walk = async (
      id: number,
      scope: Record<string, unknown>,
      svg = false,
    ): Promise<void> => {
      const node = parser.snapshot().find((n) => n.id === id);
      if (!node) throw new Error("Missing parsed node");
      if (node.kind === "element") {
        expect(
          svg
            ? SVG_ELEMENTS.has(node.name)
            : api.has(node.name) || node.name === "svg",
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
