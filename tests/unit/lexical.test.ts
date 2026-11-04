import { describe, expect, it } from "vitest";
import {
  braceEnd,
  parseAttributes,
  tagStart,
} from "../../packages/opendil/src/dil/parser/lexical";
import {
  blockLine,
  closingFence,
  openingFence,
  runLength,
  scanMemo,
  WAIT,
} from "../../packages/opendil/src/dil/parser/markdown-lexing";

describe("JavaScript token boundaries", () => {
  it("recognizes opening fences at Markdown block boundaries", () => {
    const backticks = { char: "`", length: 3 };
    expect(openingFence("```js\n", 0, 0, false)).toEqual(backticks);
    expect(openingFence("text\n    ~~~~", 9, 0, true)).toEqual({
      char: "~",
      length: 4,
    });
    expect(openingFence("1. > ```", 5, 0, true)).toEqual(backticks);
    expect(openingFence("<box>```", 5, 5, true)).toEqual(backticks);
    expect(openingFence("text ```", 5, 0, true)).toBeNull();
    expect(openingFence("-```", 1, 0, true)).toBeNull();
    expect(openingFence(" ".repeat(70) + "```", 70, 0, true)).toBeNull();
    expect(openingFence("``", 0, 0, true)).toBeNull();
    expect(openingFence("text", 0, 0, true)).toBeNull();
    expect(openingFence("``` a`b", 0, 0, true)).toBeNull();
    expect(openingFence("``", 0, 0, false)).toBe(WAIT);
    expect(openingFence("```js", 0, 0, false)).toBe(WAIT);
  });
  it("closes fences only with a long enough bare marker", () => {
    const fence = { char: "`", length: 3 };
    expect(closingFence("````\n", 0, fence, false)).toBe(4);
    expect(closingFence("```  ", 0, fence, true)).toBe(3);
    expect(closingFence("```js\n", 0, fence, false)).toBe(0);
    expect(closingFence("``\n", 0, fence, false)).toBe(0);
    expect(closingFence("~~~\n", 0, fence, false)).toBe(0);
    expect(closingFence("a ```\n", 2, fence, false)).toBe(0);
    expect(closingFence("```", 0, fence, false)).toBe(WAIT);
    expect(closingFence("```  ", 0, fence, false)).toBe(WAIT);
    const dil = (name: string) => name === "box";
    expect(closingFence("```</box>\n", 0, fence, false, undefined, dil)).toBe(
      3,
    );
    expect(closingFence("``` {/if}\n", 0, fence, false)).toBe(3);
    expect(closingFence("```{:else}\n", 0, fence, false)).toBe(3);
    expect(closingFence("```</div>\n", 0, fence, false, undefined, dil)).toBe(
      0,
    );
    expect(closingFence("``` <box>\n", 0, fence, false, undefined, dil)).toBe(
      0,
    );
  });
  it("measures runs across chunk boundaries and resumes unresolved scans", () => {
    expect(runLength("``a", 0, false)).toBe(2);
    expect(runLength("``", 0, false)).toBe(WAIT);
    expect(runLength("``", 0, true)).toBe(2);
    const memo = scanMemo();
    expect(runLength("x``", 1, false, memo)).toBe(WAIT);
    expect(memo.run).toEqual({ from: 1, to: 3 });
    expect(runLength("x````a", 1, false, memo)).toBe(4);
    expect(runLength("x````a", 2, false, memo)).toBe(3);
    expect(openingFence("```js", 0, 0, false, memo)).toBe(WAIT);
    expect(memo.line).toEqual({ from: 3, to: 5 });
    expect(openingFence("```js `x\n", 0, 0, false, memo)).toBeNull();
    expect(openingFence("```js\n", 0, 0, false, scanMemo())).toEqual({
      char: "`",
      length: 3,
    });
  });
  it("recognizes lines that a code span cannot continue into", () => {
    const dil = (name: string) => /^[A-Z]/.test(name) || name === "row";
    const starts = (source: string, complete = false) =>
      blockLine(source, 0, complete, dil);
    for (const line of [
      "- item\n",
      "+\n",
      "12) item\n",
      "# Title\n",
      "###### h\n",
      "> quote\n",
      "```js\n",
      "~~~\n",
      "---\n",
      "===  \n",
      "{#if x}\n",
      "{/if}\n",
      "{:else}\n",
      "<Callout>",
      "</row>",
    ])
      expect(starts(line), line).toBe(true);
    for (const line of [
      "-item\n",
      "#hashtag\n",
      "1.5 liters\n",
      "``x\n",
      "--\n",
      "{value}\n",
      "<div>",
      "<b>x",
      "a<Callout>\n",
      "plain prose that is long",
    ])
      expect(starts(line), line).toBe(false);
    expect(starts("-")).toBe(WAIT);
    expect(starts("-", true)).toBe(true);
    expect(starts("<Call")).toBe(WAIT);
    expect(starts("# ")).toBe(WAIT);
  });
  it("reads tag names and rejects source that is not tag-shaped", () => {
    expect(tagStart("<box padding>", 0, false)).toEqual({
      name: "box",
      closing: false,
      end: 4,
    });
    expect(tagStart("</box>", 0, false)).toEqual({
      name: "box",
      closing: true,
      end: 5,
    });
    expect(tagStart("<br/>", 0, false)?.name).toBe("br");
    expect(tagStart("<Card", 0, true)?.name).toBe("Card");
    expect(tagStart("<Card", 0, false)).toBeUndefined();
    expect(tagStart("</", 0, false)).toBeUndefined();
    expect(tagStart("</ x>", 0, false)).toBeNull();
    expect(tagStart("</br/>", 0, false)).toBeNull();
    expect(tagStart("<https://x>", 0, false)).toBeNull();
    expect(tagStart("<" + "a".repeat(65) + ">", 0, false)).toBeNull();
  });
  it.each([
    '{"brace": "}\\""}',
    "{'quote': '\\' }'}",
    "{`template ${ {value: `nested ${2}`} .value } tail`}",
    "{ /[}\\/]/g.test(value) }",
    "{ /* } */ value // }\n + 1 }",
    "{ value / 2 }",
    "{ value ? /}/ : /\\{/ }",
  ])("recognizes the complete expression %s", (source) => {
    expect(braceEnd(source + " trailing", 0)).toBe(source.length);
  });
  it("rejects unfinished expressions and malformed attributes", () => {
    expect(() => braceEnd("{`unfinished", 0)).toThrow("Unfinished");
    expect(() => parseAttributes("value=unquoted")).toThrow("Expected quoted");
    expect(() => parseAttributes('value="unfinished')).toThrow(
      "Unfinished attribute",
    );
    expect(() => parseAttributes("...spread")).toThrow("Invalid component");
  });
  it("preserves booleans, empty strings, quotes and JavaScript values", () => {
    expect(
      parseAttributes("disabled value={0} name='hello' empty=\"\""),
    ).toEqual({
      disabled: { literal: true },
      value: { expression: "0" },
      name: { literal: "hello" },
      empty: { literal: "" },
    });
    expect(parseAttributes("")).toEqual({});
  });
});
