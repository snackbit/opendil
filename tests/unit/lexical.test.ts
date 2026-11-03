import { describe, expect, it } from "vitest";
import {
  braceEnd,
  fenceMarker,
  parseAttributes,
} from "../../packages/opendil/src/dil/parser/lexical";

describe("JavaScript token boundaries", () => {
  it("recognizes fences only at a compatible Markdown line boundary", () => {
    expect(fenceMarker("```js", 0, "")).toBe("```");
    expect(fenceMarker("  ~~~", 2, "~~~")).toBe("~~~");
    expect(fenceMarker("~~~", 0, "```")).toBeUndefined();
    expect(fenceMarker("text ```", 5, "")).toBeUndefined();
    expect(fenceMarker("``", 0, "")).toBeUndefined();
    expect(fenceMarker("text", 0, "")).toBeUndefined();
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
