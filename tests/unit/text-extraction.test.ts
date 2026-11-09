import { describe, expect, it, vi } from "vitest";
import { literalMarkdown } from "../../packages/opendil/src/dil/markdown/literal-markdown";
import {
  extractDilText,
  STOCK_COMPONENTS,
} from "../../packages/opendil/src/dil/text/extract-text";
import { extractApi } from "../../scripts/agent-spec-api.mjs";

describe("extractDilText", () => {
  it("reads prose, literal Markdown, JSON literals, and text attributes in order", () => {
    const source = [
      "# Quarterly report",
      "Revenue grew **12%** with `inline code`.",
      '<box><title>{"Summary"}</title><caption>{42} accounts</caption></box>',
      literalMarkdown("Quoted {1+1} <Button onClick={x}/> </Markdown>"),
      '<button label="Open details">Ignored {count}</button>',
      '<ArtifactFile fileKey="report-pdf" label={"Q3 report"} size={3} flag/>',
      "- one\n- two",
      "| A | B |\n| - | - |\n| 1 | 2 |",
    ].join("\n\n");
    const result = extractDilText(source);
    expect(result.text).toBe(
      [
        "Quarterly report",
        "Revenue grew 12% with inline code.",
        "Summary",
        "42 accounts",
        "Quoted {1+1} <Button onClick={x}/> </Markdown>",
        "Open details",
        "Ignored",
        "Q3 report",
        "one",
        "two",
        "A B",
        "1 2",
      ].join("\n"),
    );
    expect(result.truncated).toBe(false);
    // JSON string literals reach host components as strings, so they count;
    // numbers and bare flags are not strings.
    expect(result.components).toEqual([
      {
        name: "ArtifactFile",
        literalAttributes: { fileKey: "report-pdf", label: "Q3 report" },
      },
    ]);
    expect(
      extractDilText('<ArtifactFile fileKey={"by-json"} label={name}/>')
        .components,
    ).toEqual([
      { name: "ArtifactFile", literalAttributes: { fileKey: "by-json" } },
    ]);
  });
  it("skips code, drawings, and expressions without running anything", () => {
    const worker = vi.fn();
    vi.stubGlobal("Worker", worker);
    const { text, components } = extractDilText(
      [
        "{@body const [n,setN] = DIL.useState(1)}",
        "<CodeBlock>secret()</CodeBlock>",
        "```js\nfenced()\n```",
        '<svg viewBox="0 0 1 1"><text>drawing</text></svg>',
        "<text>{n * 2}</text>",
        '<Chart content={{"title":"Not text"}}/>',
        "{#if n > 1}Branch{:else}Other{/if}",
      ].join("\n"),
    );
    expect(text).toBe("Branch\nOther");
    expect(components).toEqual([]);
    expect(worker).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("bounds the text and the source it reads", () => {
    const long = extractDilText("😀".repeat(10) + " tail", { maxLength: 5 });
    expect(long).toMatchObject({ text: "😀😀", truncated: true });
    const cut = extractDilText("First\n\nSecond paragraph", {
      maxSourceLength: 5,
    });
    expect(cut).toEqual({ text: "First", truncated: true, components: [] });
    const many = extractDilText(
      Array.from({ length: 50 }, (_, index) => `Line ${index}`).join("\n\n") +
        '\n\n<Late fileKey="kept"/>',
      { maxLength: 20 },
    );
    expect(many.text).toBe("Line 0\nLine 1\nLine 2");
    expect(many.components).toEqual([
      { name: "Late", literalAttributes: { fileKey: "kept" } },
    ]);
    expect(extractDilText("")).toEqual({
      text: "",
      truncated: false,
      components: [],
    });
  });
  it("treats every capitalized stock component as stock", () => {
    const stock = [...extractApi().api.keys()].filter((name) =>
      /^[A-Z]/.test(name),
    );
    expect([...STOCK_COMPONENTS].sort()).toEqual(stock.sort());
  });
  it("reads deeply nested containers in document order without overflowing", () => {
    const source =
      "<box>".repeat(10000) +
      '<First label="Inner"/>Text' +
      "</box>".repeat(10000) +
      '<Last label="After"/>';
    expect(extractDilText(source)).toEqual({
      text: "Inner\nText\nAfter",
      truncated: false,
      components: [
        { name: "First", literalAttributes: { label: "Inner" } },
        { name: "Last", literalAttributes: { label: "After" } },
      ],
    });
  });
  it.each([
    ["one", 3, "one", false],
    ["one\n\ntwo", 3, "one", true],
    ["one\n\ntwo", 7, "one\ntwo", false],
    ['<box label="one"><text>two</text></box>', 3, "one", true],
    ["one\n\n```js\nskipped()\n```", 3, "one", false],
    ["one\n\n{notText}", 3, "one", false],
    ["one", 0, "", true],
    ["", 0, "", false],
  ])(
    "reports omitted text for %j at length %i",
    (source, maxLength, text, truncated) => {
      expect(extractDilText(source, { maxLength })).toMatchObject({
        text,
        truncated,
      });
    },
  );
});
