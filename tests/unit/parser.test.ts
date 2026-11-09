import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DilParser } from "../../packages/opendil/src/dil/parser/dil-parser";
import type { DilNode } from "../../packages/opendil/src/dil/parser/types";
import { TagVocabulary } from "../../packages/opendil/src/dil/parser/vocabulary";
import { SVG_ELEMENTS } from "../../packages/opendil/src/dil/widgets/primitives/vocabulary";
import { extractApi } from "../../scripts/agent-spec-api.mjs";

describe("DIL incremental parsing", () => {
  it("rejects a whitespace-heavy each directive without backtracking", () => {
    const parser = new DilParser();
    const start = performance.now();
    const result = parser.append("{#each " + " ".repeat(1500) + "x}", true);
    expect(result.issues[0]?.message).toBe("Invalid each directive");
    expect(performance.now() - start).toBeLessThan(300);
  });
  it("stops excessive nesting before constructing the rest of the tree", () => {
    const parser = new DilParser();
    const result = parser.append(
      "<box>".repeat(80000) + "</box>".repeat(80000),
      true,
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ kind: "limit", code: "parser-depth-limit" }),
    );
    expect(parser.snapshot().length).toBeLessThan(200);
    expect(result.complete).toBe(true);
    expect(parser.append("<text>ignored</text>", true).nodes).toEqual([]);
  });
  it.each([
    ['["a  b", "as"] as item', '["a  b", "as"]', "item", ""],
    ["items as as , index", "items", "as", "index"],
    ["items\n as\n item,\tindex", "items\n", "item", "index"],
    ['["a"] // label\n as item', '["a"] // label\n', "item", ""],
  ])(
    "keeps each expression text and reads bindings from %s",
    (source, expression, item, index) => {
      const batch = new DilParser().append(`{#each ${source}}{/each}`, true);
      expect(
        batch.nodes.find((node) => node.kind === "each")?.attributes,
      ).toEqual({
        items: { expression },
        item: { literal: item },
        index: { literal: index },
      });
      expect(batch.issues).toEqual([]);
    },
  );
  it.each([
    "items as",
    "as item",
    "items as ,i",
    "items as item,",
    "items as item junk",
  ])("rejects malformed each bindings: %s", (source) => {
    expect(
      new DilParser().append(`{#each ${source}}`, true).issues[0]?.code,
    ).toBe("malformed-syntax");
  });
  it("applies nesting and node limits to fragmented input and directives", () => {
    for (const token of ["<box>", "{#if true}", "{#each [] as item}"]) {
      const parser = new DilParser();
      let limited = false;
      for (let i = 0; i < 130; i++) {
        const batch = parser.append(token);
        limited ||= batch.issues.some(
          (issue) => issue.code === "parser-depth-limit",
        );
      }
      expect(limited).toBe(true);
      expect(parser.snapshot().length).toBeLessThan(200);
    }
    const batch = new DilParser().append("<text/>".repeat(100001), true);
    expect(batch.nodes).toHaveLength(100000);
    expect(batch.issues[0]?.code).toBe("parser-node-limit");
  });
  it("accepts an empty document and streams plain trailing text", () => {
    const empty = new DilParser();
    expect(empty.append("", true).complete).toBe(true);
    const parser = new DilParser();
    parser.append("plain");
    parser.append(" trailing text", true);
    expect(
      parser.snapshot().find((node) => node.kind === "markdown"),
    ).toMatchObject({ text: "plain trailing text", status: "ready" });
  });
  it("keeps node identities while completing an unfinished component", () => {
    const parser = new DilParser();
    const first = parser.append("<box padding={", false);
    const id = first.nodes.find((node) => node.kind === "pending")?.id;
    expect(id).toBeDefined();
    const second = parser.append("4}><button>Ready</button>", false);
    expect(second.nodes.find((node) => node.id === id)).toMatchObject({
      name: "box",
      status: "streaming",
    });
    const last = parser.append("</box>", true);
    expect(last.nodes.find((node) => node.id === id)).toMatchObject({
      status: "ready",
    });
  });

  it("parses the complete real source equally under arbitrary fragmentation", () => {
    const source = readFileSync("apps/site/lib/examples/showcase.dil", "utf8");
    const whole = new DilParser();
    whole.append(source, true);
    const streamed = new DilParser();
    for (let at = 0; at < source.length; at += 7)
      streamed.append(source.slice(at, at + 7), false);
    streamed.append("", true);
    expect(streamed.snapshot()).toEqual(whole.snapshot());
    expect(whole.snapshot().filter((node) => node.status === "error")).toEqual(
      [],
    );
    expect(
      whole.snapshot().filter((node) => node.name === "Chart"),
    ).toHaveLength(4);
  });

  it("does not interpret code examples or fenced code as directives", () => {
    const parser = new DilParser();
    parser.append(
      '<CodeBlock language="typescript" editable>const f = <T,>(x:T) => ({x});</CodeBlock>\n\n```js\n{#if fake}\n```',
      true,
    );
    expect(
      parser.snapshot().find((node) => node.name === "CodeBlock")?.text,
    ).toContain("<T,>");
    expect(parser.snapshot().filter((node) => node.kind === "if")).toHaveLength(
      0,
    );
  });
  it.each([
    ["<box value=wrong/>", "Expected quoted value or expression for value"],
    ["{#each invalid}", "Invalid each directive"],
    ["{:else}", "Unexpected else"],
    ["{/if}", "Unexpected /if"],
    ["{/each}", "Unexpected /each"],
    ["</Unknown>", "Unexpected closing tag Unknown"],
  ])("localizes malformed source %s", (source, message) => {
    const parser = new DilParser();
    const batch = parser.append("Intro. " + source, true);
    const failed = parser.snapshot().filter((node) => node.status === "error");
    expect(failed).toHaveLength(1);
    // Readers see generic wording; the offset travels with the issue.
    expect(failed[0]?.error).toBe(message);
    expect(batch.issues).toEqual([
      { kind: "syntax", code: "malformed-syntax", message, offset: 7 },
    ]);
  });
  it.each([
    ["<box", "the opening tag <box at character 0"],
    ["<box>", "<box> at character 0"],
    ["{unfinished", "an expression or directive at character 0"],
  ])("reports unfinished source %s without errors", (source, detail) => {
    const parser = new DilParser();
    const batch = parser.append(source, true);
    expect(parser.snapshot().filter((node) => node.status === "error")).toEqual(
      [],
    );
    expect(batch.issues).toEqual([
      {
        kind: "incomplete",
        code: "unfinished-structure",
        message: `The document ended before it was finished. Unfinished: ${detail}.`,
        offset: 0,
      },
    ]);
  });
  it("handles one-character delivery, regular expressions, comments and indented fences", () => {
    const source =
      '{@body const pattern=/}/}<box value={{a:`a${ {b:1}.b }`}}>{/}/.test("}")}{#if true}yes{:else if false}no{:else}other{/if}</box>\n  ~~~js\n{#if fake}\n  ~~~';
    const whole = new DilParser();
    whole.append(source, true);
    const streamed = new DilParser();
    for (const char of source) streamed.append(char, false);
    streamed.append("", true);
    expect(streamed.snapshot()).toEqual(whole.snapshot());
    expect(whole.snapshot().filter((node) => node.status === "error")).toEqual(
      [],
    );
    expect(whole.snapshot().filter((node) => node.kind === "if")).toHaveLength(
      1,
    );
  });
  it("keeps incomplete charts and code local until syntax completes", () => {
    const parser = new DilParser();
    const first = parser.append("<Chart content={{data:[", false);
    expect(first.nodes.some((node) => node.kind === "pending")).toBe(true);
    parser.append("1,2]}}/><CodeBlock>const value={a:1};</Code", false);
    const last = parser.append("Block>", true);
    expect(last.nodes.find((node) => node.name === "CodeBlock")).toMatchObject({
      text: "const value={a:1};",
      status: "ready",
    });
  });
});

function parse(source: string, options?: { components?: string[] }) {
  const whole = new DilParser(options);
  whole.append(source, true);
  // Every fragmentation must agree with the single-chunk result.
  const streamed = new DilParser(options);
  for (const char of source) streamed.append(char, false);
  streamed.append("", true);
  expect(streamed.snapshot()).toEqual(whole.snapshot());
  return whole.snapshot();
}
const prose = (nodes: DilNode[]) =>
  nodes
    .filter((node) => node.kind === "markdown")
    .map((node) => node.text)
    .join("|");
const expressions = (nodes: DilNode[]) =>
  nodes.flatMap((node) => node.expressions);
const errors = (nodes: DilNode[]) =>
  nodes.filter((node) => node.status === "error").map((node) => node.error);

describe("Markdown code is literal DIL source", () => {
  it.each([
    "Call `debounce(fn, 100, { leading: false })` once.",
    "Wrap the chart in a `<div>` if it overflows, then `</div>` it.",
    "Doubled ``a ` {inside} `` and tripled ```{#if x}``` spans.",
    "A directive `{@body const x = 1}` and `{/if}` stay text.",
    "Spans may wrap `{one\ntwo}` lines.",
    'Use the `<Callout title="x">` component and `</row>` inline.',
  ])("keeps code spans literal: %s", (source) => {
    const nodes = parse(source);
    expect(prose(nodes)).toBe(source);
    expect(expressions(nodes)).toEqual([]);
    expect(errors(nodes)).toEqual([]);
    expect(nodes.filter((node) => node.kind !== "markdown")).toHaveLength(1);
  });
  it("holds back an open code span until its closing backticks arrive", () => {
    const parser = new DilParser();
    const first = parser.append("Set `{ leading: fal", false);
    expect(first.nodes.filter((node) => node.kind === "pending")).toEqual([]);
    expect(prose(parser.snapshot())).toBe("Set ");
    parser.append("se }`, then `<box", false);
    expect(prose(parser.snapshot())).toBe("Set `{ leading: false }`, then ");
    parser.append("` and {done}", true);
    const nodes = parser.snapshot();
    expect(prose(nodes)).toBe(
      "Set `{ leading: false }`, then `<box` and DILX0END",
    );
    expect(expressions(nodes)).toEqual(["done"]);
  });
  it("parses the rest of a paragraph normally when a backtick is unmatched", () => {
    const nodes = parse(
      "Press ` then {key}.\n\n<text>{`ok`}</text> `` {a} `{b}`",
    );
    expect(expressions(nodes)).toEqual(["key", "`ok`", "a"]);
    expect(prose(nodes)).toBe(
      "Press ` then DILX0END.\n\n|DILX0END| `` DILX0END `{b}`",
    );
    expect(errors(nodes)).toEqual([]);
  });
  it("releases an unmatched span at a blank line before the stream ends", () => {
    const parser = new DilParser();
    parser.append("Press ` then {key}.\n\n<badge>Next</badge>", false);
    const nodes = parser.snapshot();
    expect(expressions(nodes)).toEqual(["key"]);
    expect(nodes.find((node) => node.name === "badge")?.kind).toBe("element");
  });
  it("ends an unmatched span at a line that starts a component", () => {
    const callout = parse(
      "Press the ` key to open the console.\n<Callout>Tip: use `console.log` here</Callout>\nDone.",
    );
    expect(errors(callout)).toEqual([]);
    expect(callout.find((node) => node.name === "Callout")?.kind).toBe(
      "element",
    );
    expect(prose(callout)).toContain("|Tip: use `console.log` here|");
    const row = parse(
      "Press the ` key.\n<row>\n<text>Use `x` now</text>\n</row>",
    );
    expect(errors(row)).toEqual([]);
    const text = row.find((node) => node.name === "text");
    expect(row.find((node) => node.name === "row")?.status).toBe("ready");
    expect(text).toMatchObject({ kind: "element", status: "ready" });
  });
  it.each([
    ["- Press the ` key\n- Total: {count}\n- Run `npm i {x}`", ["count"]],
    ["Open ` here\n# Title {a}\n> Quote {b}", ["a", "b"]],
    ["Open ` here\n  1. First {a}\n* Second {b}", ["a", "b"]],
    ["Open ` here\n---\n{a} `{b}`", ["a"]],
    ["Open ` here {a}\nnext line {b} `", []],
  ])(
    "ends an unmatched span where a Markdown block starts: %s",
    (source, expected) => {
      const nodes = parse(source);
      expect(expressions(nodes)).toEqual(expected);
      expect(errors(nodes)).toEqual([]);
    },
  );
  it("ends an unmatched span at a block directive", () => {
    const nodes = parse("Open ` here\n{#if true}\nyes {a}\n{/if}");
    expect(errors(nodes)).toEqual([]);
    expect(nodes.find((node) => node.kind === "if")?.status).toBe("ready");
    expect(expressions(nodes)).toEqual(["a"]);
  });
  it("shows components after a stray backtick before the stream completes", () => {
    const source =
      "Press the ` key.\n<row>\n<text>Hello</text>\n<text>World</text>\n</row>\nmore text here";
    const parser = new DilParser();
    for (const char of source.slice(0, -3)) parser.append(char, false);
    const nodes = parser.snapshot();
    expect(nodes.filter((node) => node.name === "text")).toHaveLength(2);
    expect(nodes.find((node) => node.name === "row")?.status).toBe("ready");
    expect(prose(nodes)).toContain("more text");
  });
  it("ends an unmatched span where a fence interrupts the paragraph", () => {
    const nodes = parse("Run ` {first}\n```sh\nnpm i {literal}\n```\n{after}");
    expect(expressions(nodes)).toEqual(["first", "after"]);
  });
  it("does not open a code span on an escaped backtick", () => {
    const nodes = parse("Escaped \\`{value} and \\\\`{code}`");
    expect(expressions(nodes)).toEqual(["value"]);
    expect(prose(nodes)).toBe("Escaped \\`DILX0END and \\\\`{code}`");
  });
  it.each([
    ["````md\n```js\n{inner}\n```\n````\n{after}", ["after"]],
    ["```\n{a}\n```js\n{b}\n```\n{c}", ["c"]],
    ["~~~\n{a}\n```\n{b}\n~~~\n{c}", ["c"]],
    ["- item\n  ```js\n  {a}\n  ```\n> ```\n> {b}\n> ```\n{c}", ["c"]],
    ["<box>```js\n{a}\n```\n</box>{c}", ["c"]],
    ["```js `inline` {a}``` {b}", ["b"]],
    ["{x}```\n{a}\n```", ["x", "a"]],
    ["```js\n{unclosed}", []],
    ["<box>\n```js\nlet a = 1;\n```</box>\nafter {a}", ["a"]],
    ["{#if x}\n```\n{a}\n``` {/if}\n{b}", ["b"]],
    ["```\n{a}\n```</div>\n{b}", []],
  ])("follows CommonMark fence boundaries in %s", (source, expected) => {
    const nodes = parse(source);
    expect(expressions(nodes)).toEqual(expected);
    expect(errors(nodes)).toEqual([]);
  });
  it("closes a fence on the line of a DIL closing tag", () => {
    const nodes = parse("<box>\n```js\nlet a = 1;\n```</box>\nafter");
    expect(nodes.find((node) => node.name === "box")?.status).toBe("ready");
    expect(prose(nodes)).toBe("\n```js\nlet a = 1;\n```|\nafter");
  });
  it("scans long streamed runs and blank lines in linear time", () => {
    const length = 1 << 18;
    for (const source of [
      "`".repeat(length) + " {a}",
      "~".repeat(length) + "\n{a}",
      "`x\n" + " ".repeat(length) + "\n{a}",
      "```js" + "x".repeat(length) + "\n{a}",
    ]) {
      const started = performance.now();
      const parser = new DilParser();
      for (let at = 0; at < source.length; at += 64)
        parser.append(source.slice(at, at + 64), false);
      parser.append("", true);
      // Rescanning the pending run on every chunk took over two seconds per case.
      expect(performance.now() - started).toBeLessThan(1500);
    }
  });
});

describe("HTML-like prose", () => {
  it.each([
    "Wrap it in a <div> if needed, then close </div>.",
    "Line<br/>break and <img src=x onerror={alert(1)}> stay text.",
    'A <span class="x" style={{a: 1}}>tag</span> and <h1>title</h1>.',
    "Mail <me@example.com>, visit <https://example.com>, and a<b, c</d or </ e>.",
    'An unfinished <div class="open',
    "A tag at the end <span",
  ])("keeps unknown lowercase tags as text: %s", (source) => {
    const nodes = parse(source);
    expect(prose(nodes)).toBe(source);
    expect(expressions(nodes)).toEqual([]);
    expect(errors(nodes)).toEqual([]);
  });
  it.each([
    ["if a<b then {1+1} items", ["1+1"]],
    ['<a title="{x}" data={{y: 1}}> {z}', ["z"]],
    ["<https://x.y/{a}> {b}", ["b"]],
    ["<mailto:me@x.y {a}", ["a"]],
  ])("evaluates prose braces after tag-shaped text: %s", (source, expected) => {
    const nodes = parse(source);
    expect(expressions(nodes)).toEqual(expected);
    expect(errors(nodes)).toEqual([]);
  });
  it("ends a literal tag at its line so later DIL still parses", () => {
    const nodes = parse("Use <div class={x}\n<badge>{y}</badge>");
    expect(expressions(nodes)).toEqual(["y"]);
    expect(nodes.find((node) => node.name === "badge")?.kind).toBe("element");
  });
  it("keeps capitalized and registered lowercase names as components", () => {
    const stock = parse("<Widget>a</Widget><callout>b</callout>");
    expect(stock.find((node) => node.name === "Widget")?.kind).toBe("element");
    expect(prose(stock)).toContain("<callout>b</callout>");
    const custom = parse("<callout>b</callout>", { components: ["callout"] });
    expect(custom.find((node) => node.name === "callout")).toMatchObject({
      kind: "element",
      status: "ready",
    });
    const unfinished = new DilParser().append("<Widget", true);
    expect(unfinished.nodes.find((node) => node.id === 1)).toMatchObject({
      kind: "pending",
      name: "Widget",
      status: "incomplete",
    });
    expect(unfinished.issues.map((issue) => issue.kind)).toEqual([
      "incomplete",
    ]);
  });
  it("accepts only well-formed component names from the host", () => {
    const parser = new DilParser();
    parser.allow("callout");
    parser.allow([42, "bad name", "<x>", "x".repeat(65), "note"]);
    parser.allow([...Array.from({ length: 1100 }, (_, i) => "c" + i), "late"]);
    parser.append(
      "<callout></callout><note></note><c1022/><c1023/><late/>",
      true,
    );
    const elements = parser
      .snapshot()
      .filter((node) => node.kind === "element")
      .map((node) => node.name);
    expect(elements).toEqual(["note", "c1022"]);
  });
  it("matches the stock renderer vocabulary", () => {
    const lowercase = [...extractApi().api.keys(), ...SVG_ELEMENTS].filter(
      (name) => /^[a-z]/.test(name),
    );
    expect([...TagVocabulary.stock()].sort()).toEqual(
      [...new Set(lowercase)].sort(),
    );
  });
});
