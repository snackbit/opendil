import type { DilNode, NodeKind, ParseIssue, TreeBatch } from "./types";

export const MAX_NODES = 100000;
export const MAX_DEPTH = 128;
export class ParseLimit extends Error {
  constructor(
    readonly code: "parser-node-limit" | "parser-depth-limit",
    readonly offset: number,
  ) {
    super(
      code === "parser-depth-limit"
        ? `Rendering stopped: this message exceeds the nesting limit of ${MAX_DEPTH}.`
        : "Rendering stopped: this message has more parts than the renderer supports.",
    );
  }
}

/** Owns the bounded tree and the changes published by each parser append. */
export class ParserTree {
  readonly nodes: DilNode[] = [];
  readonly children = new Map<number, number[]>();
  readonly stack: number[] = [];
  declarations: string[] = [];
  issues: ParseIssue[] = [];
  private dirty = new Set<DilNode>();
  private links: TreeBatch["links"] = [];
  private revision = 0;
  constructor(private readonly maxNodes = MAX_NODES) {
    this.create("root", "document", 0, false);
  }
  get parent() {
    return this.stack.at(-1) ?? 0;
  }
  close() {
    this.finish(this.parent);
    this.stack.pop();
  }
  create(kind: NodeKind, name: string, offset: number, attach = true): DilNode {
    if (this.nodes.length >= this.maxNodes)
      throw new ParseLimit("parser-node-limit", offset);
    if (attach && this.stack.length >= MAX_DEPTH)
      throw new ParseLimit("parser-depth-limit", offset);
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
    this.touch(node);
    if (attach) {
      this.children.get(this.parent)?.push(node.id);
      this.links.push({ parent: this.parent, child: node.id });
    }
    return node;
  }
  touch(node: DilNode) {
    this.dirty.add(node);
  }
  finish(id: number) {
    const node = this.nodes[id];
    if (node) {
      node.status = "ready";
      this.touch(node);
    }
  }
  fail(node: DilNode, message: string) {
    node.status = "error";
    node.error = message;
    this.touch(node);
    this.issues.push({
      kind: "syntax",
      code: "malformed-syntax",
      message,
      offset: node.offset,
    });
  }
  stop(limit: ParseLimit) {
    this.finish(0);
    for (const id of this.stack) this.finish(id);
    this.issues.push({
      kind: "limit",
      code: limit.code,
      message: limit.message,
      offset: limit.offset,
    });
  }
  take(complete: boolean, scanned: number): TreeBatch {
    const batch = {
      revision: ++this.revision,
      nodes: [...this.dirty].map((node) => structuredClone(node)),
      links: this.links,
      declarations: this.declarations,
      issues: this.issues,
      complete,
      scanned,
    };
    this.dirty.clear();
    this.links = [];
    this.declarations = [];
    this.issues = [];
    return batch;
  }
}
