// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decodeLiteralMarkdown,
  encodeLiteralMarkdown,
  literalMarkdown,
} from "../../packages/opendil/src/dil/markdown/literal-markdown";
import { DilParser } from "../../packages/opendil/src/dil/parser/dil-parser";
import {
  DilRenderer,
  preloadHostRenderer,
} from "../../packages/opendil/src/dil/dil-renderer";
import { installInlineWorkers } from "../../packages/opendil/src/testing";
import type { DilRenderError } from "../../packages/opendil/src/dil/render-error";

// Golden vectors define the encoding contract for compatible converters.
const GOLDEN: [string, string][] = [
  ["", "<Markdown>\n\n</Markdown>"],
  ["a</Markdown>b", "<Markdown>\na<\\/Markdown>b\n</Markdown>"],
  ["a<\\/Markdown>b", "<Markdown>\na<\\\\/Markdown>b\n</Markdown>"],
  [
    "{1+1} <Button onClick={x}/> {#if a}",
    "<Markdown>\n{1+1} <Button onClick={x}/> {#if a}\n</Markdown>",
  ],
  ["x\n</Markdown", "<Markdown>\nx\n<\\/Markdown\n</Markdown>"],
];
const HOSTILE = [
  ...GOLDEN.map(([input]) => input),
  "{@body const x = 1}",
  "```\n</Markdown>\n```",
  "`code` and </CodeBlock> and <\\\\\\/Markdown> and <</Markdown>>",
  "line separator and \"quotes\" and 'apostrophes'",
  "\n\nleading and trailing line breaks\n\n",
];
/** The raw body the parser reads for a source with one block. */
function body(source: string, chunked = false) {
  const parser = new DilParser();
  if (chunked) {
    for (const char of source) parser.append(char);
    parser.append("", true);
  } else parser.append(source, true);
  const nodes = parser.snapshot();
  expect(nodes.filter((node) => node.status === "error")).toEqual([]);
  const markdown = nodes.filter((node) => node.name === "Markdown");
  expect(markdown).toHaveLength(1);
  expect(markdown[0]?.status).toBe("ready");
  return markdown[0]?.text ?? "";
}

describe("literalMarkdown", () => {
  it.each(GOLDEN)("encodes %j as the golden vector", (input, expected) => {
    expect(literalMarkdown(input)).toBe(expected);
  });
  it.each(HOSTILE)("round-trips %j through the parser", (input) => {
    const source = "Before\n\n" + literalMarkdown(input) + "\n\nAfter";
    expect(decodeLiteralMarkdown(body(source))).toBe(input);
    expect(decodeLiteralMarkdown(body(source, true))).toBe(input);
  });
  it("decodes an authored block without the wrapper line breaks", () => {
    expect(decodeLiteralMarkdown("Inline")).toBe("Inline");
    expect(encodeLiteralMarkdown("</Markdown>")).toBe("<\\/Markdown>");
  });
  it("keeps CodeBlock raw without the Markdown escape", () => {
    const parser = new DilParser();
    parser.append("<CodeBlock><\\/Markdown></CodeBlock>", true);
    expect(
      parser.snapshot().find((node) => node.name === "CodeBlock")?.text,
    ).toBe("<\\/Markdown>");
  });
  it("waits for a closing tag split across chunks and reports a cut one", () => {
    const parser = new DilParser();
    parser.append("<Markdown>\nText</Mark");
    expect(parser.snapshot().at(-1)?.text).toBe("\nText");
    parser.append("down>", true);
    expect(parser.snapshot().at(-1)).toMatchObject({
      name: "Markdown",
      text: "\nText",
      status: "ready",
    });
    const cut = new DilParser();
    const { issues } = cut.append("<Markdown>\nText</Mark", true);
    expect(issues).toEqual([
      expect.objectContaining({ code: "unfinished-structure" }),
    ]);
  });
});

describe("rendering a <Markdown> block", () => {
  let mount: HTMLDivElement;
  let root: Root;
  let uninstall: () => void;
  beforeEach(async () => {
    // Loading the host chunk is slow under coverage; tests time rendering, not imports.
    await preloadHostRenderer();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("__DIL_PARSER_WORKER__", "");
    vi.stubGlobal("__DIL_VM_WORKER__", "");
    uninstall = installInlineWorkers();
    mount = document.createElement("div");
    document.body.append(mount);
    root = createRoot(mount);
  });
  afterEach(async () => {
    await act(() => root.unmount());
    mount.remove();
    uninstall();
    vi.unstubAllGlobals();
  });
  it("shows tags, braces, and directives as Markdown text without running them", async () => {
    const errors: DilRenderError[] = [];
    const markdown =
      "## Notes\n\n**Total:** {1+1} <Button onClick={x}/> {#if a} </Markdown>";
    await act(() =>
      root.render(
        createElement(DilRenderer, {
          mode: "host",
          text: literalMarkdown(markdown),
          showStatus: false,
          onError: (error) => errors.push(error),
          components: {
            Button: () => createElement("button", null, "Host button"),
          },
        }),
      ),
    );
    await vi.waitFor(() =>
      expect(mount.querySelector("h2")?.textContent).toBe("Notes"),
    );
    expect(mount.querySelector("strong")?.textContent).toBe("Total:");
    expect(mount.textContent).toContain(
      "{1+1} <Button onClick={x}/> {#if a} </Markdown>",
    );
    expect(mount.querySelector("button")).toBeNull();
    expect(errors).toEqual([]);
  });
  it("refuses a block over the display limit and keeps the others", async () => {
    const errors: DilRenderError[] = [];
    const long = "word ".repeat(14000);
    await act(() =>
      root.render(
        createElement(DilRenderer, {
          mode: "host",
          text: literalMarkdown("Kept intro\n\n" + long + "\n\nKept outro"),
          showStatus: false,
          onError: (error) => errors.push(error),
        }),
      ),
    );
    await vi.waitFor(() => expect(mount.textContent).toContain("Kept outro"));
    expect(mount.textContent).toContain("Kept intro");
    expect(mount.querySelector('[role="alert"]')?.textContent).toBe(
      "Text block exceeds the display limit.",
    );
    expect(errors).toEqual([
      expect.objectContaining({ kind: "limit", code: "display-limit" }),
    ]);
  });
});
