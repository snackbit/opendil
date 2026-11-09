import { createStore, type StoreApi } from "zustand/vanilla";
import type { DilNode, TreeBatch } from "../parser/types";
import { ChildList } from "./child-list";
import { ExpressionEngine, EvaluationPending, type Scope } from "./expressions";
import { RenderBudget } from "./render-budget";
import { PresentationHistory } from "./presentation-history";
import { PresentationScheduler } from "./presentation-scheduler";
import { WidgetHeights } from "../widget-heights";
import type { DilSnapshot } from "../document-cache";
import {
  deliverError,
  ProblemReports,
  UNREPORTED_PROBLEMS,
  type DilRenderError,
  type DilRenderErrorCode,
} from "../render-error";

export interface NodeState {
  node: DilNode;
  children: ChildList;
}
export interface DocumentStatus {
  complete: boolean;
  /** The document was finalized while some of its structure was still open. */
  incomplete: boolean;
  revision: number;
  scanned: number;
  /** The document-level failure, shown above the content. */
  error: DilRenderError | null;
  /** The report of unfinished structure when an incomplete document was finalized. */
  ending: DilRenderError | null;
  /** Latest clipboard outcome, keyed by the intent of the action that requested it. */
  clipboard: { intent: number; ok: boolean } | null;
  /** Mounted action controls, which can request clipboard writes. */
  actions: number;
}
function presentable(node: DilNode) {
  return (
    node.status === "error" ||
    (node.kind !== "pending" &&
      (node.kind !== "markdown" || !!node.text.trim()))
  );
}
export class DilDocument {
  readonly updates = new PresentationScheduler();
  /** Mounted widget roots by node id, measured for a snapshot. */
  readonly widgets = new Map<number, HTMLElement>();
  /** Measured widget heights, held by the placeholders of loading widgets. */
  heights = new WidgetHeights();
  /**
   * The renderer showing this document committed it. Charts and graphs that
   * appear after that, with values, take turns to mount.
   */
  presented = false;
  /**
   * Its first commit shows results recorded elsewhere, from a snapshot or
   * another renderer, until it settles.
   */
  seeded = false;
  /** A renderer saw it settle; a later renderer adopts its final layout. */
  settledOnce = false;
  /**
   * The snapshot this document reported when it first settled: its first
   * evaluation. Widgets that lay out later report it again with their heights.
   */
  snapshot: DilSnapshot | undefined;
  readonly presentation = new PresentationHistory();
  readonly renderBudget = new RenderBudget();
  renderLimited = false;
  reportRenderLimit() {
    if (this.renderLimited) return;
    this.renderLimited = true;
    queueMicrotask(() =>
      this.engine.halt(
        "Rendering stopped: this message exceeds the display limit.",
        "limit",
        "render-budget",
      ),
    );
  }
  readonly nodes = new Map<number, NodeState>();
  private readonly stores = new Map<number, StoreApi<NodeState>>();
  private readonly parents = new Map<number, number>();
  private readonly flows = new Map<number, StoreApi<ChildList>>();
  private statusStore = createStore<DocumentStatus>(() => ({
    complete: false,
    incomplete: false,
    revision: 0,
    scanned: 0,
    error: null,
    ending: null,
    clipboard: null,
    actions: 0,
  }));
  get status(): StoreApi<DocumentStatus> {
    return this.statusStore;
  }
  /**
   * Makes the current status the store's initial state, which server
   * rendering and hydration read. Only before anything subscribes, as for a
   * document parsed during its first render.
   */
  settle() {
    const state = this.statusStore.getState();
    this.statusStore = createStore<DocumentStatus>(() => state);
  }
  readonly engine: ExpressionEngine;
  readonly drafts = new Map<string, string>();
  private readonly reports = new ProblemReports();
  /**
   * Receives each distinct problem once, within the ProblemReports budget.
   * Problems readers see only generic wording for are also logged.
   */
  onError: ((error: DilRenderError) => void) | undefined;
  /** Whether reported problems are also logged; hosts can turn this off. */
  console = true;
  /**
   * Reports made before the host listens, as while parsing during a first
   * render. The runtime waits too, so a render React discards starts no worker.
   */
  private held: DilRenderError[] | null = null;
  hold() {
    this.held ??= [];
    this.engine.hold();
  }
  /** Delivers held reports in order, then starts queued runtime work. */
  release() {
    const held = this.held ?? [];
    this.held = null;
    for (const problem of held) this.report(problem);
    this.engine.release();
  }
  report(problem: DilRenderError) {
    if (this.held) {
      this.held.push(problem);
      return;
    }
    const error = this.reports.take(problem);
    if (!error) return;
    // An incomplete report already lists each unfinished construct's position.
    if (
      this.console &&
      error.kind !== "incomplete" &&
      error.offset !== undefined
    )
      console.warn(
        `OpenDIL: ${error.message} (at character ${error.offset} of the message source)`,
      );
    if (
      this.console &&
      (error.kind === "incomplete" || error.message === UNREPORTED_PROBLEMS)
    )
      console.warn("OpenDIL: " + error.message);
    deliverError(this.onError, error);
  }
  /** Shows a document-level alert and reports it. */
  fail(error: DilRenderError) {
    this.status.setState({ error });
    this.report(error);
  }
  constructor() {
    this.engine = new ExpressionEngine(new EventTarget(), this.updates);
    this.engine.events.addEventListener("dil:error", (event) => {
      const detail: unknown =
        event instanceof CustomEvent ? event.detail : undefined;
      if (
        detail &&
        typeof detail === "object" &&
        "message" in detail &&
        typeof detail.message === "string"
      )
        this.fail({
          kind:
            "kind" in detail && detail.kind === "limit" ? "limit" : "runtime",
          code:
            "code" in detail && typeof detail.code === "string"
              ? (detail.code as DilRenderErrorCode)
              : "runtime-crashed",
          message: detail.message,
        });
    });
    this.nodes.set(0, {
      node: {
        id: 0,
        kind: "root",
        name: "document",
        attributes: {},
        text: "",
        expressions: [],
        status: "streaming",
        offset: 0,
        error: "",
      },
      children: new ChildList(),
    });
  }
  apply(batch: TreeBatch) {
    if (batch.revision <= this.status.getState().revision) return;
    const changedFlows = new Set<number>();
    for (const source of batch.declarations) {
      try {
        this.engine.declare(source);
      } catch (error) {
        this.fail({
          kind: "runtime",
          code: "declaration-failed",
          message:
            error instanceof Error ? error.message : "Invalid declaration",
        });
      }
    }
    for (const node of batch.nodes) {
      const previous = this.nodes.get(node.id)?.node;
      const parent = this.parents.get(node.id);
      if (
        previous &&
        parent !== undefined &&
        presentable(previous) !== presentable(node)
      )
        changedFlows.add(parent);
      const expressions =
        previous &&
        previous.expressions.length === node.expressions.length &&
        previous.expressions.every(
          (value, index) => value === node.expressions[index],
        )
          ? previous.expressions
          : node.expressions;
      const attributes =
        previous &&
        JSON.stringify(previous.attributes) === JSON.stringify(node.attributes)
          ? previous.attributes
          : node.attributes;
      const state = {
        node: { ...node, expressions, attributes },
        children: this.nodes.get(node.id)?.children ?? new ChildList(),
      };
      this.nodes.set(node.id, state);
      this.stores.get(node.id)?.setState(state);
    }
    const additions = new Map<number, number[]>();
    for (const link of batch.links) {
      this.parents.set(link.child, link.parent);
      let list = additions.get(link.parent);
      if (!list) {
        list = [];
        additions.set(link.parent, list);
      }
      list.push(link.child);
    }
    for (const [id, children] of additions) {
      changedFlows.add(id);
      const previous = this.nodes.get(id);
      if (!previous) throw new Error(`Unknown DIL parent ${id}`);
      const state = {
        ...previous,
        children: previous.children.append(children),
      };
      this.nodes.set(id, state);
      this.stores.get(id)?.setState(state);
    }
    for (const id of changedFlows) {
      const flow = this.flows.get(id);
      if (flow) flow.setState(this.presentedChildren(id), true);
    }
    const ending =
      batch.issues.find((issue) => issue.kind === "incomplete") ??
      this.status.getState().ending;
    this.status.setState({
      revision: batch.revision,
      scanned: batch.scanned,
      complete: batch.complete,
      incomplete: ending !== null,
      ending,
    });
    for (const issue of batch.issues) this.report(issue);
  }
  private presentedChildren(id: number) {
    const children = this.node(id).getState().children.toArray();
    return new ChildList().append(
      children.filter((child) => {
        const node = this.nodes.get(child)?.node;
        return node !== undefined && presentable(node);
      }),
    );
  }
  flowChildren(id: number): StoreApi<ChildList> {
    const existing = this.flows.get(id);
    if (existing) return existing;
    const created = createStore(() => this.presentedChildren(id));
    this.flows.set(id, created);
    return created;
  }
  node(id: number): StoreApi<NodeState> {
    const store = this.stores.get(id);
    if (store) return store;
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Unknown DIL node ${id}`);
    const created = createStore<NodeState>(() => node);
    this.stores.set(id, created);
    return created;
  }
  attributes(node: DilNode, scope: Scope): Record<string, unknown> {
    if (
      Object.values(node.attributes).some(
        (attribute) =>
          attribute.expression !== undefined &&
          !this.engine.isFresh(attribute.expression, scope),
      )
    )
      throw new EvaluationPending();
    return Object.fromEntries(
      Object.entries(node.attributes).map(([name, attribute]) => [
        name,
        attribute.expression === undefined
          ? attribute.literal
          : this.engine.read(attribute.expression, scope),
      ]),
    );
  }
}
