import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DilParser } from "../../packages/opendil/src/dil/parser/dil-parser";

describe("DIL incremental parsing", () => {
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
    const source = readFileSync("apps/demo/src/showcase.dil", "utf8");
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
    "<box",
    "<box>",
    "<box value=wrong/>",
    "{unfinished",
    "{#each invalid}",
    "{:else}",
    "{/if}",
    "{/each}",
    "</unknown>",
  ])("localizes malformed source %s", (source) => {
    const parser = new DilParser();
    parser.append(source, true);
    expect(parser.snapshot().some((node) => node.status === "error")).toBe(
      true,
    );
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
