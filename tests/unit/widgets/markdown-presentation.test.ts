// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { MarkdownNode } from "../../../packages/opendil/src/dil/markdown/markdown-node";
import { DilDocument } from "../../../packages/opendil/src/dil/runtime/document";
import {
  advanceMarkdown,
  currentMarkdown,
  EMPTY_MARKDOWN,
  markdownIndent,
  normalizeMarkdown,
} from "../../../packages/opendil/src/dil/markdown/markdown-stream";
import type { DilNode } from "../../../packages/opendil/src/dil/parser/types";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("keeps finalized blocks and trailing-block keys stable when new blocks arrive", () => {
  const first = advanceMarkdown(
    EMPTY_MARKDOWN,
    "# Heading\n\nParagraph",
    false,
  );
  const old = currentMarkdown(first);
  const next = advanceMarkdown(
    first,
    "# Heading\n\nParagraph grows\n\nNext",
    false,
  );
  expect(currentMarkdown(next)[0]).toBe(old[0]);
  expect(currentMarkdown(next)[1]?.offset).toBe(old[1]?.offset);
  const done = advanceMarkdown(next, next.source, true);
  expect(currentMarkdown(done).map((block) => block.text)).toEqual([
    "# Heading",
    "Paragraph grows",
    "Next",
  ]);
  expect(advanceMarkdown(done, done.source, true)).toBe(done);
  expect(
    currentMarkdown(advanceMarkdown(done, "Replacement", true))[0]?.text,
  ).toBe("Replacement");
  expect(currentMarkdown(EMPTY_MARKDOWN)).toEqual([]);
  expect(currentMarkdown(advanceMarkdown(EMPTY_MARKDOWN, "#", false))).toEqual(
    [],
  );
  expect(currentMarkdown(advanceMarkdown(EMPTY_MARKDOWN, "  ", false))).toEqual(
    [],
  );
  expect(markdownIndent("\n  Heading")).toBe(2);
  expect(markdownIndent("   ")).toBeUndefined();
  expect(normalizeMarkdown("\n  Heading\n Next", 2)).toBe("\nHeading\nNext");
  expect(normalizeMarkdown("Heading", 0)).toBe("Heading");
});
it("never replaces completed DOM when cloned parser records and prose updates arrive", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("__DIL_VM_WORKER__", "");
  vi.stubGlobal(
    "Worker",
    class {
      postMessage() {}
      terminate() {}
    },
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  const documentModel = new DilDocument();
  const root = document.createElement("div");
  document.body.append(root);
  const reactRoot = createRoot(root);
  const node: DilNode = {
    id: 1,
    kind: "markdown",
    name: "markdown",
    attributes: {},
    expressions: [],
    text: "# Heading\n\nGrowing",
    status: "streaming",
    offset: 0,
    error: "",
  };
  const render = (text: string) =>
    reactRoot.render(
      createElement(MarkdownNode, {
        node: { ...node, text, expressions: [] },
        document: documentModel,
        scope: {},
        instance: "",
        inline: false,
        svg: false,
      }),
    );
  await act(() => render(node.text));
  const heading = root.querySelector("h1"),
    paragraph = root.querySelector("p");
  for (const suffix of [" slowly", " and steadily", "\n\nAnother block"])
    await act(() => render((node.text += suffix)));
  expect(root.querySelector("h1")).toBe(heading);
  expect(root.querySelector("p")).toBe(paragraph);
  expect(paragraph?.textContent).toBe("Growing slowly and steadily");
  await act(() => reactRoot.unmount());
  documentModel.engine.dispose();
  root.remove();
});
