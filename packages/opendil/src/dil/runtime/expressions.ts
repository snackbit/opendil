import { createStore } from "zustand/vanilla";
import { ActionReceipt } from "./action-receipt";
import { PresentationScheduler } from "./presentation-scheduler";
import {
  EvaluationCache,
  hasReservedKey,
  NOT_JSON,
  parseJson,
  type Scope,
  type EvaluationEntry,
} from "./evaluation-cache";
import {
  ExecutionQueue,
  type ExecutionJob,
  type ExecutionReply,
  type ExecutionResult,
  type KeyedResult,
} from "./execution-queue";
import type { DilRenderErrorCode } from "../render-error";
import {
  explainRuntimeStartFailure,
  RUNTIME_START_FAILURE,
  type InlineWorker,
} from "./inline-worker";
import { adoptRuntime } from "./runtime-pool";
export { warmExpressionRuntime } from "./runtime-pool";
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
  private readonly literals = new Map<
    string,
    { ready: true; value: unknown } | null
  >();
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
  /**
   * Queues jobs without starting the worker until release(), as for a
   * document parsed during a render that React may discard.
   */
  hold() {
    this.queue.hold();
  }
  release() {
    this.queue.release();
  }
  constructor(
    readonly events = new EventTarget(),
    private readonly updates = new PresentationScheduler(),
  ) {
    this.queue = new ExecutionQueue(
      // Without a worker, the startup report halts the engine before jobs time out.
      (message) => this.start().worker?.postMessage(message),
      (job, reply) => this.receive(job, reply),
      (message, kind, code) => this.halt(message, kind, code),
      () => this.dependents(),
    );
  }
  /** Whether no evaluation or action is queued or awaiting the worker. */
  get idle() {
    return this.failed !== "" || this.queue.idle;
  }
  /**
   * Retained results a call may invalidate, listed when the call leaves so
   * the worker refreshes the ones it affects in the same turn.
   */
  private dependents() {
    const dependents: Array<Record<string, unknown>> = [];
    for (const [key, entry] of this.cache.entries)
      if (entry.ready && entry.owners > 0)
        dependents.push({
          key,
          source: entry.source,
          scope: entry.scope,
          ...(entry.dependencies ? { dependencies: entry.dependencies } : {}),
        });
    return dependents;
  }
  private start(): InlineWorker {
    if (this.runtime) return this.runtime;
    const runtime = adoptRuntime();
    runtime.route.onMessage = (data) => this.queue.reply(data);
    runtime.route.onStop = (message, code) =>
      this.halt(message, "runtime", code);
    this.runtime = runtime.worker;
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
        (entry.dirty || entry.provisional) &&
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
      const blocked =
        reply.fatal === RUNTIME_START_FAILURE && explainRuntimeStartFailure();
      if (blocked) this.halt(blocked, "runtime", "wasm-blocked");
      else this.halt("Execution stopped: " + reply.fatal);
      return;
    }
    const results = reply.results ?? [];
    // Every evaluation of a batch settles, so a reply without one cannot
    // leave it dirty and send it again forever.
    const answered = new Set(results.map((result) => result.key));
    for (const key of job.keys ?? [])
      if (!answered.has(key))
        results.push({
          key,
          revision: reply.revision ?? 0,
          error: reply.error ?? "Isolated evaluation returned no result",
        });
    if (
      [reply, ...(reply.steps ?? []), ...results].some(
        (result) => result.error === "interrupted",
      )
    ) {
      this.halt(
        "Execution stopped: this action exceeded its time limit.",
        "limit",
        "execution-timeout",
      );
      return;
    }
    // A call or a declaration that fails leaves the document's state unknown.
    const steps =
      job.type === "call" ? [{ job, result: reply }] : this.steps(job, reply);
    for (const step of steps)
      if (step.result.error) {
        this.halt(
          "Execution stopped: " + step.result.error,
          "runtime",
          step.job.type === "declare"
            ? "declaration-failed"
            : "expression-failed",
        );
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
    const urgent = job.type === "call";
    const invalidated = new Set<string>();
    const updated = new Set<string>();
    // A declaration adds a name without changing what existing names hold.
    // Publish its refreshed results only when values differ or a view waited.
    for (const step of steps)
      this.invalidate(
        step.result,
        urgent,
        step.job.type === "declare" ? new Set() : invalidated,
      );
    for (const result of results) {
      this.invalidate(result, urgent, invalidated);
      if (this.accept(result)) updated.add(result.key);
    }
    // A result refreshed to the same value in this reply changes nothing on screen.
    for (const key of invalidated)
      if (this.cache.entries.get(key)?.dirty) updated.add(key);
    if (updated.size)
      this.notify(
        updated,
        urgent || [...updated].some((key) => this.urgentKeys.has(key)),
      );
    for (const key of updated)
      if (!this.cache.entries.get(key)?.dirty) this.urgentKeys.delete(key);
    this.fill();
    // Hosts wait for this to know a document's values are final.
    if (this.queue.idle) this.events.dispatchEvent(new Event("dil:idle"));
  }
  /** Pairs a batch's declarations and releases with their results. */
  private steps(job: ExecutionJob, reply: ExecutionReply) {
    // A batch that failed as a whole fails its first step, or its evaluations.
    const results = reply.steps ?? (reply.error ? [reply] : []);
    return (job.steps ?? []).flatMap((step, index) => {
      const result = results[index];
      return result ? [{ job: step, result }] : [];
    });
  }
  /** Marks the results that read state this one wrote. */
  private invalidate(
    result: ExecutionResult,
    urgent: boolean,
    changed: Set<string>,
  ) {
    if (!result.changed) return;
    const revision = result.revision ?? 0;
    const written = result.bindings ? new Set(result.bindings) : undefined;
    for (const [key, entry] of this.cache.entries) {
      if (
        !written ||
        !entry.dependencies ||
        entry.dependencies.some((name) => written.has(name))
      ) {
        entry.dirty = true;
        entry.invalidated = revision;
        changed.add(key);
        if (urgent) this.urgentKeys.add(key);
      }
    }
  }
  /** Stores a result; returns whether views reading it must render again. */
  private accept(result: KeyedResult) {
    const key = result.key;
    const entry = this.cache.entries.get(key);
    if (!entry || !(entry.owners > 0 || entry.oneShot)) {
      for (const handle of result.handles ?? [])
        if (!this.handleRefs.has(handle)) this.released.add(handle);
      return false;
    }
    const revision = result.revision ?? 0;
    // A result evaluated before a later action invalidated it is stale.
    if (revision < entry.invalidated) return false;
    // The same value at the same revision keeps its identity, so controls
    // and memoized views see no change. A new revision always publishes:
    // a control waits for it to drop its draft, even when the value stayed.
    const raw = result.error ?? JSON.stringify(result.value) ?? "undefined";
    // A snapshot's callback forwards to this result, so it is always replaced.
    const same =
      entry.ready &&
      entry.raw === raw &&
      entry.revision === revision &&
      !(entry.provisional && result.handles?.length);
    entry.provisional = false;
    if (!same) {
      entry.value = this.decode(result);
      entry.raw = raw;
    }
    const awaitingFreshness = entry.awaitingFreshness;
    entry.awaitingFreshness = false;
    entry.ready = true;
    entry.dirty = false;
    entry.revision = revision;
    if (result.dependencies) entry.dependencies = result.dependencies;
    else delete entry.dependencies;
    entry.oneShot = false;
    this.replaceHandles(entry, result.handles ?? []);
    this.cache.touch(key);
    return !same || awaitingFreshness;
  }
  /** Stops the runtime; a reported halt reaches the document as a dil:error event. */
  halt(
    reason: string,
    kind: "runtime" | "limit" = "runtime",
    code: DilRenderErrorCode = "runtime-crashed",
    report = true,
  ) {
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
        new CustomEvent("dil:error", {
          detail: { message: reason, kind, code },
        }),
      );
  }
  dispose() {
    this.halt("Message disposed", "runtime", "runtime-crashed", false);
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
      if (this.literal(source)) continue;
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
    const entry =
      this.literal(source) ??
      this.cache.entries.get(this.cache.key(source, scope));
    if (!entry?.ready) throw new EvaluationPending();
    if (entry.value instanceof Error) throw entry.value;
    return entry.value;
  }
  hasValue(source: string, scope: Scope = {}) {
    const entry =
      this.literal(source) ??
      this.cache.entries.get(this.cache.key(source, scope));
    return !!entry?.ready && !(entry.value instanceof Error);
  }
  isFresh(source: string, scope: Scope = {}) {
    if (this.literal(source)) return true;
    const entry = this.cache.entries.get(this.cache.key(source, scope));
    // A remounted view can observe a refresh while its old value is cached.
    // Wake it when freshness returns, even if the value itself is unchanged.
    if (entry?.dirty && !this.stopped) entry.awaitingFreshness = true;
    return !!entry?.ready && (this.stopped || !entry.dirty);
  }
  /**
   * A JSON literal spells the same value as JavaScript, so it is read here
   * without starting QuickJS: converted documents and plain values stay inert.
   * Output limits still apply. The document source limit bounds its length.
   */
  private literal(source: string): { ready: true; value: unknown } | null {
    let literal = this.literals.get(source);
    if (literal !== undefined) return literal;
    literal = null;
    // A "__proto__" key means something else in JavaScript, and a handler
    // marker would revive as a callback; QuickJS evaluates both. Keys are
    // checked after parsing because JSON escapes such as "$dilHandler"
    // spell the same key.
    const parsed = parseJson(source.trim());
    if (parsed !== NOT_JSON && !hasReservedKey(parsed, 0)) {
      let value: unknown;
      try {
        value = this.revive(parsed);
      } catch {
        value = new Error("Message output exceeds structural limits");
      }
      literal = { ready: true, value };
    }
    if (this.literals.size >= 1024) this.literals.clear();
    this.literals.set(source, literal);
    return literal;
  }
  /**
   * The JSON results of evaluations that are current, by cache key, for a
   * snapshot. Errors are left out; callbacks keep their encoded form.
   */
  results(): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const [key, entry] of this.cache.entries)
      if (
        entry.ready &&
        !entry.dirty &&
        entry.raw !== undefined &&
        !(entry.value instanceof Error)
      )
        values[key] = parseJson(entry.raw);
    return values;
  }
  /**
   * Shows a snapshot's results before the worker has evaluated anything.
   * Each stays provisional until its first evaluation confirms or replaces
   * it; a callback forwards to the confirmed one, and does nothing before.
   */
  seed(values: Readonly<Record<string, unknown>>) {
    for (const [key, value] of Object.entries(values)) {
      const parsed = this.cache.parseKey(key);
      if (!parsed || this.literal(parsed[0])) continue;
      const [source, scope] = parsed;
      const { key: actual, entry } = this.cache.ensure(source, scope);
      if (actual !== key || entry.ready) continue;
      let revived: unknown;
      try {
        revived = this.revive(value);
      } catch {
        continue;
      }
      if (typeof revived === "function") {
        const forward = (argument: unknown): unknown =>
          entry.value !== forward && typeof entry.value === "function"
            ? (entry.value as (argument: unknown) => unknown)(argument)
            : undefined;
        revived = forward;
      }
      entry.value = revived;
      entry.raw = JSON.stringify(value);
      entry.ready = true;
      entry.dirty = false;
      entry.provisional = true;
    }
  }
  evaluate(source: string, scope: Scope = {}): unknown {
    if (this.literal(source)) return this.read(source);
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
  private decode(reply: ExecutionResult): unknown {
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
