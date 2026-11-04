import { LexicalState, parseAttributes, tagStart } from "./lexical";
import { AUTOLINK, LiteralTag } from "./literal-tag";
import {
  blockLine,
  closingFence,
  openingFence,
  runLength,
  scanMemo,
  WAIT,
  type Fence,
} from "./markdown-lexing";
import type { DilNode, NodeKind, ParseIssue, TreeBatch } from "./types";
import { TagVocabulary } from "./vocabulary";
import { cutTag, finishOpen } from "./unfinished";

type Mode = "text" | "tag" | "brace" | "code" | "fence" | "span" | "literal";
type Step = typeof WAIT | undefined;
const MAX_SPAN_RUN = 16;
export interface DilParserOptions {
  /** Host-registered component names; lowercase ones become DIL tags. */
  components?: readonly string[];
}

/**
 * Append-only parser. Closed tokens are never scanned again. Text inside an
 * unclosed code span is held back until its closing backticks arrive; if its
 * block ends first, only the text since the opener is scanned again as prose.
 */
export class DilParser {
  private source = "";
  private cursor = 0;
  private textStart = 0;
  private tokenStart = 0;
  private mode: Mode = "text";
  private lexical = new LexicalState();
  private fence: Fence = { char: "", length: 0 };
  /** The open code span; lineBreak is set while only blanks follow a line feed. */
  private span = { start: 0, length: 0, lineBreak: -1 };
  /** Code span opener lengths that have no closer before `until`. */
  private unmatched = { until: 0, lengths: new Set<number>() };
  /** Where the current Markdown block began, after the latest tag or block directive. */
  private blockStart = 0;
  private readonly vocabulary = new TagVocabulary();
  private readonly isComponent = (name: string) =>
    this.vocabulary.isComponent(name);
  private literalTag = new LiteralTag();
  private readonly memo = scanMemo();
  private tokenNode = -1;
  private nodes: DilNode[] = [];
  private children = new Map<number, number[]>();
  private stack: [number, ...number[]] = [0];
  private dirty = new Set<number>();
  private links: TreeBatch["links"] = [];
  private declarations: string[] = [];
  private issues: ParseIssue[] = [];
  private revision = 0;

  constructor(options: DilParserOptions = {}) {
    this.create("root", "document", 0, false);
    this.vocabulary.allow(options.components);
  }

  /** Registers component names for tags that start after this call. */
  allow(components: unknown) {
    this.vocabulary.allow(components);
  }

  private get parent(): number {
    return this.stack[0];
  }
  private closeFrame() {
    this.finish(this.parent);
    this.stack.shift();
  }

  private create(
    kind: NodeKind,
    name: string,
    offset: number,
    attach = true,
  ): DilNode {
    const node: DilNode = {
      id: this.nodes.length,
      kind,
      name,
      attributes: {},
      text: "",
      expressions: [],
      status: "streaming",
      offset,
      error: "",
    };
    this.nodes.push(node);
    this.children.set(node.id, []);
    this.dirty.add(node.id);
    if (attach) {
      this.children.get(this.parent)?.push(node.id);
      this.links.push({ parent: this.parent, child: node.id });
    }
    return node;
  }

  private touch(node: DilNode) {
    this.dirty.add(node.id);
  }

  private markdown(): DilNode {
    const last = this.children.get(this.parent)?.at(-1);
    const node = last === undefined ? undefined : this.nodes[last];
    if (node?.kind === "markdown" && node.status === "streaming") return node;
    return this.create("markdown", "", this.textStart);
  }

  private flushText(end: number) {
    const text = this.source.slice(this.textStart, end);
    if (text) {
      const node = this.markdown();
      node.text += text;
      this.touch(node);
    }
    this.textStart = end;
  }

  private finishMarkdown() {
    const last = this.children.get(this.parent)?.at(-1);
    const node = last === undefined ? undefined : this.nodes[last];
    if (node?.kind === "markdown") {
      node.status = "ready";
      this.touch(node);
    }
  }

  /** Moves scanned code into the open CodeBlock. */
  private codeText() {
    const node = this.nodes[this.parent];
    if (node) {
      node.text += this.source.slice(this.textStart, this.cursor);
      this.touch(node);
    }
    this.textStart = this.cursor;
  }

  /** At the end of input, drops a cut-off tag; completion reports it. */
  private cutToken() {
    this.tokenStart = this.cursor;
    this.tokenNode = -1;
    this.mode = "tag";
    this.cursor = this.source.length;
  }

  private finish(id: number) {
    const node = this.nodes[id];
    if (node) {
      node.status = "ready";
      this.touch(node);
    }
  }

  private fail(node: DilNode, message: string) {
    node.status = "error";
    node.error = message;
    this.touch(node);
    this.issues.push({ kind: "syntax", message, offset: node.offset });
  }

  /** Open constructs keep what they completed; an unfinished token is dropped. */
  private finishIncomplete() {
    const open = this.stack
      .slice(0, -1)
      .reverse()
      .flatMap((id) => this.nodes[id] ?? []);
    const node = this.nodes[this.tokenNode];
    const { mode, source, tokenStart: offset } = this;
    const pending =
      mode === "tag" && node?.kind === "pending" ? node : undefined;
    const token =
      mode === "brace" || mode === "tag"
        ? { source, mode, offset, pending }
        : undefined;
    const issue = finishOpen(open, token);
    for (const changed of [...open, pending]) if (changed) this.touch(changed);
    if (issue) this.issues.push(issue);
  }

  /** Returns whether the directive ends the current Markdown block. */
  private directive(token: string): boolean {
    if (token.startsWith("@body ")) {
      this.declarations.push(token.slice(6).trim());
      return false;
    }
    if (token.startsWith("#each ")) {
      this.finishMarkdown();
      const node = this.create("each", "each", this.tokenStart);
      const match =
        /^#each\s+([\s\S]+)\s+as\s+([\w$]+)(?:\s*,\s*([\w$]+))?$/.exec(token);
      if (!match?.[1] || !match[2]) {
        this.fail(node, "Invalid each directive");
        return true;
      }
      node.attributes = {
        items: { expression: match[1] },
        item: { literal: match[2] },
        index: { literal: match[3] ?? "" },
      };
      this.stack.unshift(node.id);
      return true;
    }
    if (token.startsWith("#if ")) {
      this.finishMarkdown();
      const node = this.create("if", "if", this.tokenStart);
      this.stack.unshift(node.id);
      const branch = this.create("branch", "branch", this.tokenStart);
      branch.attributes = { condition: { expression: token.slice(4) } };
      this.stack.unshift(branch.id);
      return true;
    }
    if (token === ":else" || token.startsWith(":else if ")) {
      this.finishMarkdown();
      const branch = this.nodes[this.parent];
      if (branch?.kind !== "branch") {
        this.fail(
          this.create("pending", "", this.tokenStart),
          "Unexpected else",
        );
        return true;
      }
      this.closeFrame();
      const next = this.create("branch", "branch", this.tokenStart);
      if (token !== ":else")
        next.attributes = { condition: { expression: token.slice(9) } };
      this.stack.unshift(next.id);
      return true;
    }
    if (token === "/each" || token === "/if") {
      this.finishMarkdown();
      if (token === "/if" && this.nodes[this.parent]?.kind === "branch")
        this.closeFrame();
      const expected = token.slice(1);
      if (this.nodes[this.parent]?.kind !== expected) {
        this.fail(
          this.create("pending", "", this.tokenStart),
          `Unexpected ${token}`,
        );
        return true;
      }
      this.closeFrame();
      return true;
    }
    const node = this.markdown();
    node.text += `DILX${node.expressions.length}END`;
    node.expressions.push(token);
    this.touch(node);
    return false;
  }

  private tag(token: string) {
    if (token.startsWith("</")) {
      this.finishMarkdown();
      const name = token.slice(2, -1).trim();
      if (this.parent === 0 || this.nodes[this.parent]?.name !== name) {
        this.fail(
          this.create("pending", name, this.tokenStart),
          `Unexpected closing tag ${name}`,
        );
        return;
      }
      this.closeFrame();
      return;
    }
    const node = this.nodes[this.tokenNode];
    if (!node) return;
    const match = /^<([\w-]+)([\s\S]*?)(\/?)>$/.exec(token);
    if (!match?.[1]) {
      this.fail(node, "Invalid opening tag");
      return;
    }
    node.kind = "element";
    node.name = match[1];
    try {
      node.attributes = parseAttributes(match[2] ?? "");
    } catch (error) {
      this.fail(
        node,
        error instanceof Error ? error.message : "Invalid attributes",
      );
      return;
    }
    this.touch(node);
    if (match[3]) this.finish(node.id);
    else {
      this.stack.unshift(node.id);
      if (node.name === "CodeBlock") this.mode = "code";
    }
  }

  append(suffix: string, complete = false): TreeBatch {
    this.source += suffix;
    this.scan(complete);
    // At the end of input, unclosed code spans are ordinary prose after all.
    while (complete && this.mode === "span") {
      this.abandonSpan(this.source.length);
      this.scan(complete);
    }
    if (this.mode === "span") this.flushText(this.span.start);
    else if (["text", "fence", "literal"].includes(this.mode))
      this.flushText(this.cursor);
    if (this.mode === "code") this.codeText();
    if (complete) {
      this.finishMarkdown();
      this.finishIncomplete();
      this.finish(0);
    }
    const batch: TreeBatch = {
      revision: ++this.revision,
      nodes: [...this.dirty]
        .map((id) => structuredClone(this.nodes[id]))
        .filter((node): node is DilNode => node !== undefined),
      links: this.links,
      declarations: this.declarations,
      issues: this.issues,
      complete,
      scanned: this.cursor,
    };
    this.dirty.clear();
    this.links = [];
    this.declarations = [];
    this.issues = [];
    return batch;
  }

  private scan(complete: boolean) {
    while (this.cursor < this.source.length) {
      const char = this.source.charAt(this.cursor);
      const next = this.source[this.cursor + 1] ?? "";
      if (this.mode === "code") {
        const closing = "</CodeBlock>";
        if (
          char === "<" &&
          closing.startsWith(
            this.source.slice(this.cursor, this.cursor + closing.length),
          )
        ) {
          if (this.source.length - this.cursor < closing.length) {
            if (!complete) break;
            this.codeText();
            this.cutToken();
            break;
          }
          if (this.source.startsWith(closing, this.cursor)) {
            this.codeText();
            this.closeFrame();
            this.cursor += closing.length;
            this.textStart = this.cursor;
            this.blockStart = this.cursor;
            this.mode = "text";
            continue;
          }
        }
        this.cursor++;
        continue;
      }
      // Leave sufficient lookahead for delimiters crossing a chunk boundary.
      const tagEnd =
        this.mode === "tag" &&
        this.lexical.neutral &&
        this.lexical.depth === 0 &&
        (char === ">" || (char === "/" && next === ">"));
      if (!complete && this.cursor + 2 >= this.source.length && !tagEnd) break;
      if (this.mode === "brace" || this.mode === "tag") {
        if (this.token(char, next, complete) === WAIT) break;
        continue;
      }
      const step =
        this.mode === "fence"
          ? this.fenced(char, complete)
          : this.mode === "span"
            ? this.spanned(char, complete)
            : this.mode === "literal"
              ? this.literal(char, next)
              : this.text(char, next, complete);
      if (step === WAIT) break;
    }
  }

  /** Advances through a tag or brace token with JavaScript lexical rules. */
  private token(char: string, next: string, complete: boolean): Step {
    if (
      this.lexical.neutral &&
      this.lexical.depth === 0 &&
      this.mode === "tag" &&
      char === "/"
    ) {
      this.cursor++;
      return;
    }
    if (
      this.mode === "brace" &&
      this.cursor === this.tokenStart + 1 &&
      char === "/"
    ) {
      const tail = this.source.slice(this.cursor);
      if (
        !complete &&
        ["/if", "/each"].some((closing) => closing.startsWith(tail))
      )
        return WAIT;
      if (/^\/(?:if|each)\s*}/.test(tail)) this.lexical.previous = "v";
    }
    if (
      this.mode === "tag" &&
      char === ">" &&
      this.lexical.neutral &&
      this.lexical.depth === 0
    ) {
      this.cursor++;
      const token = this.source.slice(this.tokenStart, this.cursor);
      this.mode = "text";
      this.tag(token);
      this.textStart = this.cursor;
      this.blockStart = this.cursor;
      return;
    }
    this.cursor += this.lexical.consume(char, next);
    if (
      this.mode === "brace" &&
      this.lexical.neutral &&
      this.lexical.depth === 0
    ) {
      const block = this.directive(
        this.source.slice(this.tokenStart + 1, this.cursor - 1).trim(),
      );
      this.mode = "text";
      this.textStart = this.cursor;
      if (block) this.blockStart = this.cursor;
    }
  }

  private text(char: string, next: string, complete: boolean): Step {
    // An escaped backtick opens no code span; an escaped backslash escapes nothing.
    if (char === "\\" && (next === "`" || next === "\\")) {
      this.cursor += 2;
      return;
    }
    if (char === "`" || char === "~") {
      const fence = openingFence(
        this.source,
        this.cursor,
        this.blockStart,
        complete,
        this.memo,
      );
      if (fence === WAIT) return WAIT;
      if (fence) {
        this.fence = fence;
        this.mode = "fence";
        this.cursor += fence.length;
        return;
      }
      if (char === "`") return this.openSpan(complete);
    }
    if (char === "<" && /^[A-Za-z/]?$/.test(next))
      return this.openTag(complete);
    if (char === "{") {
      this.flushText(this.cursor);
      this.tokenStart = this.cursor;
      this.mode = "brace";
      this.lexical = new LexicalState();
      this.lexical.depth = 1;
      this.cursor++;
      return;
    }
    this.cursor++;
    // Finish paragraphs as they arrive, rather than accumulating one huge Markdown node.
    if (char === "\n" && next === "\n") {
      this.cursor++;
      this.flushText(this.cursor);
      this.finishMarkdown();
    }
  }

  private openTag(complete: boolean): Step {
    const open = this.parent ? this.nodes[this.parent]?.name : undefined;
    const rest = complete ? this.source.slice(this.cursor) : "";
    if (rest && cutTag(rest, open, this.vocabulary)) {
      this.flushText(this.cursor);
      this.cutToken();
      return;
    }
    const tag = tagStart(this.source, this.cursor, complete);
    if (tag === undefined) return WAIT;
    if (tag === null) {
      if (AUTOLINK.test(this.source.slice(this.cursor, this.cursor + 34)))
        this.startLiteral(new LiteralTag(true));
      this.cursor++;
      return;
    }
    // HTML-like prose such as <div> or </br> is not DIL; keep it as text.
    if (!this.isComponent(tag.name)) {
      this.startLiteral(new LiteralTag());
      this.cursor = tag.end;
      return;
    }
    this.flushText(this.cursor);
    this.finishMarkdown();
    this.tokenStart = this.cursor;
    this.mode = "tag";
    this.lexical = new LexicalState();
    this.cursor++;
    this.tokenNode = tag.closing
      ? -1
      : this.create("pending", tag.name, this.tokenStart).id;
  }

  private startLiteral(tag: LiteralTag) {
    this.mode = "literal";
    this.literalTag = tag;
  }

  /** A literal tag stays text up to its ">", its line end, or a prose brace. */
  private literal(char: string, next: string): void {
    const taken = this.literalTag.step(char, next);
    this.cursor += taken;
    if (!taken || this.literalTag.closed) this.mode = "text";
  }

  private fenced(char: string, complete: boolean): Step {
    const length = closingFence(
      this.source,
      this.cursor,
      this.fence,
      complete,
      this.memo,
      this.isComponent,
    );
    if (length === WAIT) return WAIT;
    this.cursor += Math.max(length, 1);
    if (length) this.mode = "text";
  }

  private openSpan(complete: boolean): Step {
    const length = runLength(this.source, this.cursor, complete, this.memo);
    if (length === WAIT) return WAIT;
    const { until, lengths } = this.unmatched;
    // Each opener length is rescanned at most once per paragraph. Bounding the
    // length bounds that work; longer runs are literal, as in practice they are.
    if (
      length <= MAX_SPAN_RUN &&
      (this.cursor >= until || !lengths.has(length))
    ) {
      this.span = { start: this.cursor, length, lineBreak: -1 };
      this.mode = "span";
    }
    this.cursor += length;
  }

  private spanned(char: string, complete: boolean): Step {
    const { lineBreak } = this.span;
    if (lineBreak >= 0) {
      if (char === " " || char === "\t") {
        this.cursor++;
        return;
      }
      // A span cannot continue past a blank line or into another block.
      const ends =
        char === "\n" ||
        blockLine(this.source, this.cursor, complete, this.isComponent);
      if (ends === WAIT) return WAIT;
      this.span.lineBreak = -1;
      if (ends) {
        this.abandonSpan(lineBreak);
        return;
      }
    }
    if (char === "`") {
      const length = runLength(this.source, this.cursor, complete, this.memo);
      if (length === WAIT) return WAIT;
      this.cursor += length;
      if (length === this.span.length) this.mode = "text";
      return;
    }
    if (char === "\n") this.span.lineBreak = this.cursor;
    this.cursor++;
  }

  /** The span has no closer in its block: its opener is literal text. */
  private abandonSpan(blockEnd: number) {
    if (this.span.start >= this.unmatched.until)
      this.unmatched = { until: blockEnd, lengths: new Set() };
    this.unmatched.lengths.add(this.span.length);
    this.cursor = this.span.start + this.span.length;
    this.mode = "text";
  }

  snapshot(): DilNode[] {
    return structuredClone(this.nodes);
  }
}
