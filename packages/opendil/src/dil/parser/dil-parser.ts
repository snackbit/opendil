import { fenceMarker, LexicalState, parseAttributes } from "./lexical";
import type { DilNode, NodeKind, TreeBatch } from "./types";

/** Append-only parser. Closed tokens are never scanned again. */
export class DilParser {
  private source = "";
  private cursor = 0;
  private textStart = 0;
  private tokenStart = 0;
  private mode: "text" | "tag" | "brace" | "code" = "text";
  private lexical = new LexicalState();
  private fence = "";
  private tokenNode = -1;
  private nodes: DilNode[] = [];
  private children = new Map<number, number[]>();
  private stack: [number, ...number[]] = [0];
  private dirty = new Set<number>();
  private links: TreeBatch["links"] = [];
  private declarations: string[] = [];
  private revision = 0;

  constructor() {
    this.create("root", "document", 0, false);
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

  private finish(id: number) {
    const node = this.nodes[id];
    if (node) {
      node.status = "ready";
      this.touch(node);
    }
  }

  private fail(node: DilNode, message: string) {
    node.status = "error";
    node.error = `${message} at character ${node.offset}`;
    this.touch(node);
  }

  private directive(token: string) {
    if (token.startsWith("@body ")) {
      this.declarations.push(token.slice(6).trim());
      return;
    }
    if (token.startsWith("#each ")) {
      this.finishMarkdown();
      const node = this.create("each", "each", this.tokenStart);
      const match =
        /^#each\s+([\s\S]+)\s+as\s+([\w$]+)(?:\s*,\s*([\w$]+))?$/.exec(token);
      if (!match?.[1] || !match[2]) {
        this.fail(node, "Invalid each directive");
        return;
      }
      node.attributes = {
        items: { expression: match[1] },
        item: { literal: match[2] },
        index: { literal: match[3] ?? "" },
      };
      this.stack.unshift(node.id);
      return;
    }
    if (token.startsWith("#if ")) {
      this.finishMarkdown();
      const node = this.create("if", "if", this.tokenStart);
      this.stack.unshift(node.id);
      const branch = this.create("branch", "branch", this.tokenStart);
      branch.attributes = { condition: { expression: token.slice(4) } };
      this.stack.unshift(branch.id);
      return;
    }
    if (token === ":else" || token.startsWith(":else if ")) {
      this.finishMarkdown();
      const branch = this.nodes[this.parent];
      if (branch?.kind !== "branch") {
        this.fail(
          this.create("pending", "", this.tokenStart),
          "Unexpected else",
        );
        return;
      }
      this.closeFrame();
      const next = this.create("branch", "branch", this.tokenStart);
      if (token !== ":else")
        next.attributes = { condition: { expression: token.slice(9) } };
      this.stack.unshift(next.id);
      return;
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
        return;
      }
      this.closeFrame();
      return;
    }
    const node = this.markdown();
    node.text += `DILX${node.expressions.length}END`;
    node.expressions.push(token);
    this.touch(node);
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
    if (this.mode === "tag") {
      const node = this.nodes[this.tokenNode];
      const name = /^<([\w-]+)(?:\s|\/|>)/.exec(
        this.source.slice(this.tokenStart, this.tokenStart + 64),
      )?.[1];
      if (node?.kind === "pending" && name && node.name !== name) {
        node.name = name;
        this.touch(node);
      }
    }
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
          if (this.source.length - this.cursor < closing.length && !complete)
            break;
          if (this.source.startsWith(closing, this.cursor)) {
            const node = this.nodes[this.parent];
            if (node) {
              node.text += this.source.slice(this.textStart, this.cursor);
              this.touch(node);
            }
            this.closeFrame();
            this.cursor += closing.length;
            this.textStart = this.cursor;
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
        if (
          this.lexical.neutral &&
          this.lexical.depth === 0 &&
          this.mode === "tag" &&
          char === "/"
        ) {
          this.cursor++;
          continue;
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
            break;
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
          continue;
        }
        this.cursor += this.lexical.consume(char, next);
        if (
          this.mode === "brace" &&
          this.lexical.neutral &&
          this.lexical.depth === 0
        ) {
          this.directive(
            this.source.slice(this.tokenStart + 1, this.cursor - 1).trim(),
          );
          this.mode = "text";
          this.textStart = this.cursor;
        }
        continue;
      }
      const marker = fenceMarker(this.source, this.cursor, this.fence);
      if (marker) {
        this.fence = this.fence ? "" : marker;
        this.cursor += 3;
        continue;
      }
      if (!this.fence && char === "<" && /[A-Za-z/]/.test(next)) {
        this.flushText(this.cursor);
        this.finishMarkdown();
        this.tokenStart = this.cursor;
        this.mode = "tag";
        this.lexical = new LexicalState();
        this.cursor++;
        if (next !== "/")
          this.tokenNode = this.create(
            "pending",
            /^<([\w-]+)(?:\s|\/|>)/.exec(
              this.source.slice(this.tokenStart, this.tokenStart + 64),
            )?.[1] ?? "",
            this.tokenStart,
          ).id;
        continue;
      }
      if (!this.fence && char === "{") {
        this.flushText(this.cursor);
        this.tokenStart = this.cursor;
        this.mode = "brace";
        this.lexical = new LexicalState();
        this.lexical.depth = 1;
        this.cursor++;
        continue;
      }
      this.cursor++;
      // Finish paragraphs as they arrive, rather than accumulating one huge Markdown node.
      if (char === "\n" && next === "\n" && !this.fence) {
        this.cursor++;
        this.flushText(this.cursor);
        this.finishMarkdown();
      }
    }
    if (this.mode === "text") this.flushText(this.cursor);
    if (this.mode === "code") {
      const node = this.nodes[this.parent];
      if (node) {
        node.text += this.source.slice(this.textStart, this.cursor);
        this.touch(node);
        this.textStart = this.cursor;
      }
    }
    if (complete) {
      this.finishMarkdown();
      if (this.mode === "brace")
        this.fail(
          this.create("pending", "", this.tokenStart),
          "Unfinished expression or directive",
        );
      if (this.mode === "tag") {
        const pending = this.nodes[this.tokenNode];
        if (pending) this.fail(pending, "Unfinished opening tag");
      }
      for (const id of this.stack.slice(0, -1)) {
        const node = this.nodes[id];
        if (node) this.fail(node, `Unfinished ${node.name}`);
      }
      this.finish(0);
    }
    const batch: TreeBatch = {
      revision: ++this.revision,
      nodes: [...this.dirty]
        .map((id) => structuredClone(this.nodes[id]))
        .filter((node): node is DilNode => node !== undefined),
      links: this.links,
      declarations: this.declarations,
      complete,
      scanned: this.cursor,
    };
    this.dirty.clear();
    this.links = [];
    this.declarations = [];
    return batch;
  }

  snapshot(): DilNode[] {
    return structuredClone(this.nodes);
  }
}
