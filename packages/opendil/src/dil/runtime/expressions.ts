import { createStore } from "zustand/vanilla";
import { ActionReceipt } from "./action-receipt";
import { PresentationScheduler } from "./presentation-scheduler";
import {
  EvaluationCache,
  type Scope,
  type EvaluationEntry,
} from "./evaluation-cache";
import {
  ExecutionQueue,
  type ExecutionJob,
  type ExecutionReply,
} from "./execution-queue";
import {
  explainRuntimeStartFailure,
  RUNTIME_START_FAILURE,
  startInlineWorker,
  type InlineWorker,
} from "./inline-worker";
export type { Scope } from "./evaluation-cache";
export interface BindingState {
  values: Record<string, unknown>;
  versions: Record<string, number>;
  catalog: number;
}
export class EvaluationPending extends Error {
  constructor() {
    super("Waiting for isolated evaluation");
  }
}
export class ExpressionEngine {
  readonly store = createStore<BindingState>(() => ({
    values: {},
    versions: {},
    catalog: 0,
  }));
  /** Started by the first job, so documents without expressions or state never load QuickJS. */
  private runtime: InlineWorker | null = null;
  private readonly cache = new EvaluationCache();
  private readonly queue: ExecutionQueue;
  private intent = 0;
  private failed = "";
  private gestureUntil = 0;
  private handleRefs = new Map<number, number>();
  private released = new Set<number>();
  private pendingChanges = new Set<string>();
  private urgentKeys = new Set<string>();
  compilations = 0;
  get stopped() {
    return this.failed !== "";
  }
  get stats() {
    return {
      ...this.queue.stats,
      cached: this.cache.entries.size,
      handles: this.handleRefs.size,
    };
  }
  markGesture() {
    this.gestureUntil = performance.now() + 750;
  }
  constructor(
    readonly events = new EventTarget(),
    private readonly updates = new PresentationScheduler(),
  ) {
    this.queue = new ExecutionQueue(
      // Without a worker, the startup report halts the engine before jobs time out.
      (message) => this.start().worker?.postMessage(message),
      (job, reply) => this.receive(job, reply),
      (message, kind) => this.halt(message, kind),
    );
  }
  private start(): InlineWorker {
    this.runtime ??= startInlineWorker(__DIL_VM_WORKER__, {
      role: "expression runtime",
      crashMessage: "Message execution worker failed.",
      onMessage: (data: unknown) => this.queue.reply(data),
      onStop: (message) => this.halt(message),
    });
    return this.runtime;
  }
  private reference(handle: number, delta: number) {
    const count = (this.handleRefs.get(handle) ?? 0) + delta;
    if (count > 0) {
      this.handleRefs.set(handle, count);
      this.released.delete(handle);
    } else {
      this.handleRefs.delete(handle);
      this.released.add(handle);
    }
  }
  private replaceHandles(entry: EvaluationEntry, handles: readonly number[]) {
    for (const handle of handles) this.reference(handle, 1);
    for (const handle of entry.handles) this.reference(handle, -1);
    entry.handles = handles;
  }
  private retire(key: string, entry: EvaluationEntry) {
    this.replaceHandles(entry, []);
    this.urgentKeys.delete(key);
    this.notify([key]);
  }
  private notify(keys: Iterable<string>, urgent = false) {
    for (const key of keys) this.pendingChanges.add(key);
    this.updates.enqueue(
      "bindings",
      () => {
        const versions = { ...this.store.getState().versions };
        for (const key of this.pendingChanges) {
          if (this.cache.entries.has(key))
            versions[key] = (versions[key] ?? 0) + 1;
          else delete versions[key];
        }
        this.pendingChanges.clear();
        this.store.setState({ versions });
      },
      urgent,
    );
  }
  private fill() {
    if (this.failed) return;
    for (const [key, entry] of this.cache.entries) {
      if (
        entry.dirty &&
        (entry.owners > 0 || entry.oneShot) &&
        !this.queue.has(key)
      ) {
        if (
          !this.queue.evaluate(key, {
            source: entry.source,
            scope: entry.scope,
          })
        )
          break;
      }
    }
    this.cache.prune(
      (key) => this.queue.has(key),
      (key, entry) => this.retire(key, entry),
    );
    if (
      this.queue.stats.inFlight === 0 &&
      this.queue.stats.queued === 0 &&
      this.released.size
    ) {
      const handles = [...this.released].filter(
        (handle) => !this.handleRefs.has(handle),
      );
      this.released.clear();
      if (handles.length)
        this.queue.mutate({ type: "release", payload: { handles } });
    }
  }
  private receive(job: ExecutionJob, reply: ExecutionReply) {
    if (job.type === "call" && typeof job.payload.handle === "number")
      this.reference(job.payload.handle, -1);
    if (reply.fatal) {
      this.halt(
        (reply.fatal === RUNTIME_START_FAILURE &&
          explainRuntimeStartFailure()) ||
          "Execution stopped: " + reply.fatal,
      );
      return;
    }
    if (reply.error === "interrupted") {
      this.halt(
        "Execution stopped: this action exceeded its time limit.",
        "limit",
      );
      return;
    }
    if (reply.error && !job.key) {
      const message = "Execution stopped: " + reply.error;
      this.halt(message);
      return;
    }
    // Only an action can copy; its intent lets the calling control show the outcome.
    if (
      reply.copy &&
      job.type === "call" &&
      typeof job.payload.intent === "number"
    )
      this.events.dispatchEvent(
        new CustomEvent("dil:copy", {
          detail: { text: reply.copy, intent: job.payload.intent },
        }),
      );
    const revision = reply.revision ?? 0;
    if (reply.changed) {
      const changed = reply.bindings ? new Set(reply.bindings) : undefined;
      const invalidated: string[] = [];
      for (const [key, entry] of this.cache.entries) {
        if (
          !changed ||
          !entry.dependencies ||
          entry.dependencies.some((name) => changed.has(name))
        ) {
          entry.dirty = true;
          entry.invalidated = revision;
          invalidated.push(key);
          if (job.type === "call") this.urgentKeys.add(key);
        }
      }
      this.notify(invalidated, job.type === "call");
    }
    if (job.key) {
      const key = job.key;
      const entry = this.cache.entries.get(key);
      if (entry && (entry.owners > 0 || entry.oneShot)) {
        const urgent = this.urgentKeys.has(key);
        if (revision >= entry.invalidated) {
          entry.value = this.decode(reply);
          entry.ready = true;
          entry.dirty = false;
          entry.revision = revision;
          if (reply.dependencies) entry.dependencies = reply.dependencies;
          else delete entry.dependencies;
          entry.oneShot = false;
          const handles = reply.handles ?? [];
          this.replaceHandles(entry, handles);
          this.cache.touch(job.key);
          this.urgentKeys.delete(key);
        }
        this.notify([key], urgent);
      } else {
        for (const handle of reply.handles ?? [])
          if (!this.handleRefs.has(handle)) this.released.add(handle);
      }
    }
    this.fill();
  }
  /** Stops the runtime; a reported halt reaches the document as a dil:error event. */
  halt(reason: string, kind: "runtime" | "limit" = "runtime", report = true) {
    if (this.failed) return;
    this.failed = reason;
    this.queue.stop();
    this.updates.cancel("bindings");
    this.pendingChanges.clear();
    this.urgentKeys.clear();
    this.runtime?.dispose();
    this.store.setState((state) => ({ catalog: state.catalog + 1 }));
    if (report)
      this.events.dispatchEvent(
        new CustomEvent("dil:error", { detail: { message: reason, kind } }),
      );
  }
  dispose() {
    this.halt("Message disposed", "runtime", false);
    this.failed = "Message disposed";
    this.cache.entries.clear();
    this.handleRefs.clear();
    this.released.clear();
    this.updates.dispose();
  }
  /** Committed views own demand; cancelled renders never enqueue worker work. */
  retain(expressions: readonly string[], scope: Scope = {}) {
    const keys = new Set<string>();
    for (const source of expressions) {
      this.check(source);
      const { key, entry } = this.cache.ensure(source, scope);
      if (!keys.has(key)) {
        entry.owners++;
        keys.add(key);
      }
    }
    this.fill();
    return () => {
      for (const key of keys) {
        const entry = this.cache.entries.get(key);
        if (entry) {
          entry.owners = Math.max(0, entry.owners - 1);
          if (!entry.owners && !entry.oneShot) this.queue.cancel(key);
        }
      }
      this.fill();
    };
  }
  read(source: string, scope: Scope = {}): unknown {
    const entry = this.cache.entries.get(this.cache.key(source, scope));
    if (!entry?.ready) throw new EvaluationPending();
    if (entry.value instanceof Error) throw entry.value;
    return entry.value;
  }
  hasValue(source: string, scope: Scope = {}) {
    const entry = this.cache.entries.get(this.cache.key(source, scope));
    return !!entry?.ready && !(entry.value instanceof Error);
  }
  isFresh(source: string, scope: Scope = {}) {
    const entry = this.cache.entries.get(this.cache.key(source, scope));
    return !!entry?.ready && (this.stopped || !entry.dirty);
  }
  evaluate(source: string, scope: Scope = {}): unknown {
    this.check(source);
    if (this.failed) throw new Error(this.failed);
    const { key, entry } = this.cache.ensure(source, scope);
    if (!entry.ready || entry.dirty) {
      entry.oneShot = true;
      this.fill();
    }
    this.cache.touch(key);
    return this.read(source, scope);
  }
  private check(source: string) {
    if (source.length > 65536)
      throw new Error("Expression source limit exceeded");
  }
  evaluationRevision(source: string | undefined, scope: Scope = {}) {
    return source === undefined
      ? 0
      : (this.cache.entries.get(this.cache.key(source, scope))?.revision ?? 0);
  }
  signature(expressions: readonly string[], scope: Scope, state: BindingState) {
    return (
      state.catalog +
      ":" +
      expressions
        .map((source) => state.versions[this.cache.key(source, scope)] ?? 0)
        .join(",")
    );
  }
  declare(source: string) {
    if (this.failed) throw new Error(this.failed);
    this.queue.mutate({ type: "declare", payload: { source } });
  }
  private call(handle: number, argument: unknown, setter?: string) {
    if (this.failed) return new ActionReceipt(this.intent);
    const intent = ++this.intent;
    // One activation authorizes at most one action to use the clipboard.
    const gesture = performance.now() < this.gestureUntil;
    this.gestureUntil = 0;
    this.reference(handle, 1);
    const replaced = this.queue.mutate({
      type: "call",
      ...(setter && typeof argument !== "function" ? { setter } : {}),
      payload: {
        handle,
        argument,
        intent,
        gesture,
      },
    });
    if (typeof replaced?.payload.handle === "number")
      this.reference(replaced.payload.handle, -1);
    return new ActionReceipt(intent);
  }
  private decode(reply: ExecutionReply): unknown {
    try {
      return reply.error ? new Error(reply.error) : this.revive(reply.value);
    } catch {
      return new Error("Message output exceeds structural limits");
    }
  }
  private revive(value: unknown, depth = 0): unknown {
    if (depth > 64) throw new Error("Output nesting limit");
    if (Array.isArray(value)) {
      if (value.length > 10000) throw new Error("Output array limit");
      return value.map((entry) => this.revive(entry, depth + 1));
    }
    if (value && typeof value === "object") {
      if (
        depth === 0 &&
        "$dilHandler" in value &&
        typeof value.$dilHandler === "number"
      ) {
        const handle = value.$dilHandler;
        const setter =
          "$dilSetter" in value && typeof value.$dilSetter === "string"
            ? value.$dilSetter
            : undefined;
        return (argument: unknown) => this.call(handle, argument, setter);
      }
      return Object.fromEntries(
        Object.entries(value)
          .filter(
            ([key]) => !["__proto__", "constructor", "prototype"].includes(key),
          )
          .map(([key, entry]) => [key, this.revive(entry, depth + 1)]),
      );
    }
    return value;
  }
}
