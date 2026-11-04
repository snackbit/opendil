// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DilParser } from "../../packages/opendil/src/dil/parser/dil-parser";
import type {
  ParseIssue,
  TreeBatch,
} from "../../packages/opendil/src/dil/parser/types";
import { DilDocument } from "../../packages/opendil/src/dil/runtime/document";
import { NodeView } from "../../packages/opendil/src/dil/view/node-view";
import {
  readRenderError,
  UNREPORTED_PROBLEMS,
  type DilRenderError,
} from "../../packages/opendil/src/dil/render-error";

// A response cut off inside its third card, as after Stop or max_tokens.
const INTRO = "Results\n\n";
const CUT =
  INTRO +
  "<grid><box border>First card</box><box border>Second card</box>" +
  "<box border>Third ca";
const SECOND_BOX = CUT.lastIndexOf("<box");

function statuses(parser: DilParser) {
  return parser
    .snapshot()
    .filter((node) => node.kind === "element")
    .map((node) => `${node.name}:${node.status}`);
}

describe("parsing a document that ended early", () => {
  it("keeps completed children and reports the open structure once", () => {
    const parser = new DilParser();
    const batch = parser.append(CUT, true);
    expect(statuses(parser)).toEqual([
      "grid:incomplete",
      "box:ready",
      "box:ready",
      "box:incomplete",
    ]);
    expect(parser.snapshot().some((node) => node.status === "error")).toBe(
      false,
    );
    expect(batch.issues).toEqual([
      {
        kind: "incomplete",
        message:
          "The document ended before it was finished. Unfinished: " +
          `<grid> at character ${INTRO.length}, <box> at character ${SECOND_BOX}.`,
        offset: INTRO.length,
      },
    ]);
  });

  it("reports the same issues when the source arrives one character at a time", () => {
    const whole = new DilParser();
    const wholeBatch = whole.append(CUT, true);
    const streamed = new DilParser();
    const issues: ParseIssue[] = [];
    for (const char of CUT) issues.push(...streamed.append(char).issues);
    issues.push(...streamed.append("", true).issues);
    expect(streamed.snapshot()).toEqual(whole.snapshot());
    expect(issues).toEqual(wholeBatch.issues);
  });

  it("keeps an unfinished repeat hidden and an unfinished condition visible", () => {
    const parser = new DilParser();
    const source =
      "{#if shown}<text>Visible</text>{#each items as item}<text>{item}";
    const batch = parser.append(source, true);
    const nodes = parser.snapshot();
    expect(nodes.find((node) => node.kind === "if")?.status).toBe("incomplete");
    expect(nodes.find((node) => node.kind === "branch")?.status).toBe(
      "incomplete",
    );
    expect(nodes.find((node) => node.kind === "each")?.status).toBe(
      "incomplete",
    );
    expect(batch.issues[0]?.message).toBe(
      "The document ended before it was finished. Unfinished: " +
        `{#if} at character 0, {#each} at character ${source.indexOf("{#each")}, ` +
        `<text> at character ${source.lastIndexOf("<text>")}.`,
    );
  });

  it.each(["<box>Done</bo", "<box>Done</box", "<box>Done</"])(
    "drops the unfinished closing tag in %s",
    (source) => {
      const parser = new DilParser();
      const batch = parser.append(source, true);
      expect(statuses(parser)).toEqual(["box:incomplete"]);
      expect(
        parser
          .snapshot()
          .filter((node) => node.kind === "markdown")
          .map((node) => node.text),
      ).toEqual(["Done"]);
      expect(batch.issues[0]?.message).toContain(
        "<box> at character 0, a closing tag at character 9.",
      );
    },
  );

  it.each([
    ["<box>A</box><butt", "the opening tag <butt"],
    ["<box>A</box><gri", "the opening tag <gri"],
    ["<box>A</box><grid-", "the opening tag <grid-"],
    ["<box>A</box><", "a tag"],
  ])(
    "drops the cut-off opening tag in %s, whole or streamed",
    (source, label) => {
      const offset = source.lastIndexOf("<");
      for (const streamed of [false, true]) {
        const parser = new DilParser();
        const issues: ParseIssue[] = [];
        if (streamed) for (const char of source) parser.append(char);
        issues.push(...parser.append(streamed ? "" : source, true).issues);
        const markdown = parser
          .snapshot()
          .filter((node) => node.kind === "markdown");
        expect(markdown.map((node) => node.text)).toEqual(["A"]);
        expect(issues).toEqual([
          {
            kind: "incomplete",
            message: `The document ended before it was finished. Unfinished: ${label} at character ${offset}.`,
            offset,
          },
        ]);
      }
    },
  );

  it("keeps prose that only looks like a tag", () => {
    const parser = new DilParser();
    const batch = parser.append("Compare a <b> and x < y, then <grip", true);
    expect(parser.snapshot().at(-1)?.text).toBe(
      "Compare a <b> and x < y, then <grip",
    );
    expect(batch.issues).toEqual([]);
  });

  it.each([
    ['<CodeBlock language="js">let a = 1;\n</CodeB', "let a = 1;\n"],
    ["<CodeBlock>x</", "x"],
    ["<CodeBlock>x<", "x"],
  ])("leaves a cut-off closing tag out of the code in %j", (source, code) => {
    const parser = new DilParser();
    const batch = parser.append(source, true);
    expect(parser.snapshot()[1]).toMatchObject({
      name: "CodeBlock",
      status: "incomplete",
      text: code,
    });
    expect(batch.issues[0]?.message).toMatch(
      /^The document ended before it was finished\. Unfinished: <CodeBlock> at character 0, a (closing )?tag at character \d+\.$/,
    );
  });

  it("summarizes deep nesting instead of listing every open element", () => {
    const source = "<box>".repeat(20000);
    const message = new DilParser().append(source, true).issues[0]?.message;
    expect(message).toBe(
      "The document ended before it was finished. Unfinished: " +
        "<box> at character 0, <box> at character 5, <box> at character 10, " +
        "<box> at character 15, 19992 more, <box> at character 99980, " +
        "<box> at character 99985, <box> at character 99990, " +
        "<box> at character 99995.",
    );
  });

  it("reports nothing for a finished document", () => {
    const parser = new DilParser();
    expect(parser.append("<box>Done</box>", false).issues).toEqual([]);
    expect(parser.append("", true).issues).toEqual([]);
  });
});

describe("presenting problems to readers and hosts", () => {
  let mount: HTMLDivElement;
  let root: Root;
  let warn: ReturnType<typeof vi.spyOn>;
  let model: DilDocument;
  let reported: DilRenderError[];
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mount = document.createElement("div");
    document.body.append(mount);
    root = createRoot(mount);
    model = new DilDocument();
    reported = [];
    model.onError = (error) => reported.push(error);
  });
  afterEach(async () => {
    await act(() => root.unmount());
    model.engine.dispose();
    mount.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  async function show(batch: TreeBatch) {
    await act(() => {
      model.apply(batch);
      root.render(createElement(NodeView, { id: 0, document: model }));
    });
  }

  it("renders the completed cards of an interrupted grid without an error", async () => {
    await show(new DilParser().append(CUT, true));
    expect(mount.textContent).toContain("First card");
    expect(mount.textContent).toContain("Second card");
    expect(mount.textContent).toContain("Third ca");
    expect(mount.querySelector('[role="alert"]')).toBeNull();
    expect(model.status.getState()).toMatchObject({
      complete: true,
      incomplete: true,
    });
    expect(reported).toEqual([
      expect.objectContaining({ kind: "incomplete", offset: INTRO.length }),
    ]);
    expect(warn).toHaveBeenCalledWith(`OpenDIL: ${reported[0]?.message}`);
  });

  it("shows readers generic wording for malformed source and reports the details once", async () => {
    const parser = new DilParser();
    await show(parser.append('<box>Kept</box><slider max=5 value="1"/>', true));
    const alert = mount.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe(
      "This part of the response couldn't be shown.",
    );
    expect(mount.textContent).toContain("Kept");
    expect(mount.textContent).not.toContain("character");
    const issue = {
      kind: "syntax",
      message: "Expected quoted value or expression for max",
      offset: 15,
    } as const;
    expect(reported).toEqual([issue]);
    // Replayed issues are not reported again.
    model.report(issue);
    expect(reported).toHaveLength(1);
    expect(model.status.getState().incomplete).toBe(false);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      "OpenDIL: Expected quoted value or expression for max (at character 15 of the message source)",
    );
  });

  it("enables a control cut off inside its children once the message is final", async () => {
    const parser = new DilParser();
    await show(parser.append("<pressable><text>Open</text><text>Deta", false));
    const control = () => mount.querySelector("button");
    expect(control()?.textContent).toContain("Open");
    expect(control()?.disabled).toBe(true);
    await show(parser.append("", true));
    expect(model.status.getState().incomplete).toBe(true);
    expect(control()?.disabled).toBe(false);
  });

  it("reports at most 20 problems per message, then one notice", async () => {
    const source = "<slider max=>\n".repeat(200);
    await show(new DilParser().append(source + "<box>cut", true));
    expect(reported).toHaveLength(22);
    expect(
      reported.slice(0, 20).every((error) => error.kind === "syntax"),
    ).toBe(true);
    expect(reported[20]).toEqual({
      kind: "limit",
      message: UNREPORTED_PROBLEMS,
    });
    // The end of the document is reported even after the budget ran out.
    expect(reported[21]?.kind).toBe("incomplete");
    expect(warn).toHaveBeenCalledTimes(22);
    model.report({ kind: "syntax", message: "Later", offset: 1 });
    expect(reported).toHaveLength(22);
  });

  it("bounds report messages in every mode", () => {
    model.report({ kind: "runtime", message: "x".repeat(5000) });
    expect(reported[0]?.message).toHaveLength(2000);
  });

  it("keeps rendering when the host's onError throws", async () => {
    const failure = new Error("host handler failed");
    model.onError = () => {
      throw failure;
    };
    const rethrown: (() => void)[] = [];
    const batch = new DilParser().append("<box>Kept</box><slider max=>", true);
    const microtask = vi
      .spyOn(globalThis, "queueMicrotask")
      .mockImplementation((task) => rethrown.push(task));
    model.apply(batch);
    microtask.mockRestore();
    await show(batch);
    expect(mount.textContent).toContain("Kept");
    expect(model.status.getState()).toMatchObject({ complete: true });
    expect(rethrown).toHaveLength(1);
    expect(() => rethrown[0]?.()).toThrow(failure);
  });

  it("classifies runtime halts and keeps their alert", async () => {
    model.engine.halt(
      "Execution stopped: too many actions were requested.",
      "limit",
    );
    expect(reported).toEqual([
      {
        kind: "limit",
        message: "Execution stopped: too many actions were requested.",
      },
    ]);
    expect(model.status.getState().error).toContain("too many actions");
    const other = new DilDocument();
    const errors: DilRenderError[] = [];
    other.onError = (error) => errors.push(error);
    other.engine.halt("Message execution worker failed.");
    expect(errors.map((error) => error.kind)).toEqual(["runtime"]);
    other.engine.dispose();
    // Neither is logged: readers already see these messages.
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("reading errors forwarded by the iframe runtime", () => {
  it.each([
    [
      { kind: "syntax", message: "Bad", offset: 4 },
      { kind: "syntax", message: "Bad", offset: 4 },
    ],
    [
      { kind: "runtime", message: "Stopped" },
      { kind: "runtime", message: "Stopped" },
    ],
    [
      { kind: "incomplete", message: "Cut", offset: 0, extra: true },
      { kind: "incomplete", message: "Cut", offset: 0 },
    ],
  ])("accepts %j", (value, expected) => {
    expect(readRenderError(value)).toEqual(expected);
  });
  it.each([
    null,
    "syntax",
    { kind: "fatal", message: "Bad" },
    { kind: "syntax", message: 4 },
    { kind: "syntax", message: "Bad", offset: -1 },
    { kind: "syntax", message: "Bad", offset: 1.5 },
    { kind: "syntax", message: "Bad", offset: "4" },
    { kind: "syntax", message: "Bad", offset: 5_000_001 },
  ])("rejects %j", (value) => {
    expect(readRenderError(value)).toBeUndefined();
  });
  it("bounds forwarded messages", () => {
    expect(
      readRenderError({ kind: "limit", message: "x".repeat(5000) })?.message,
    ).toHaveLength(2000);
  });
});
