import type { DilRenderErrorCode } from "../render-error";
/** The outcome of one evaluation or declaration. */
export interface ExecutionResult {
  value?: unknown;
  error?: string;
  changed?: boolean;
  revision?: number;
  dependencies?: string[];
  bindings?: string[];
  handles?: number[];
}
export interface KeyedResult extends ExecutionResult {
  key: string;
}
export interface ExecutionReply extends ExecutionResult {
  id: number;
  copy?: string;
  /** Declarations and releases of a batch, in order. */
  steps?: ExecutionResult[];
  /** Evaluations of a batch, or the dependents a call re-evaluated. */
  results?: KeyedResult[];
  /** The VM can no longer be trusted; the document must stop. */
  fatal?: string;
}
function strings(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? (value as string[])
    : undefined;
}
function readResult(data: unknown): ExecutionResult | undefined {
  if (!data || typeof data !== "object") return undefined;
  const reply = data as Record<string, unknown>;
  const dependencies = strings(reply.dependencies);
  const bindings = strings(reply.bindings);
  const handles =
    Array.isArray(reply.handles) &&
    reply.handles.every((item) => Number.isSafeInteger(item) && item >= 0)
      ? (reply.handles as number[])
      : undefined;
  return {
    ...("value" in reply ? { value: reply.value } : {}),
    ...(typeof reply.error === "string" ? { error: reply.error } : {}),
    ...(reply.changed === true ? { changed: true } : {}),
    ...(typeof reply.revision === "number" && Number.isFinite(reply.revision)
      ? { revision: reply.revision }
      : {}),
    ...(dependencies ? { dependencies } : {}),
    ...(bindings ? { bindings } : {}),
    ...(handles ? { handles } : {}),
  };
}
function readList<T>(value: unknown, read: (entry: unknown) => T | undefined) {
  if (!Array.isArray(value)) return undefined;
  const entries: T[] = [];
  for (const entry of value) {
    const parsed = read(entry);
    if (parsed) entries.push(parsed);
  }
  return entries;
}
function readKeyed(data: unknown): KeyedResult | undefined {
  const key =
    data && typeof data === "object" ? Reflect.get(data, "key") : undefined;
  if (typeof key !== "string") return undefined;
  const result = readResult(data);
  return result && { ...result, key };
}
/** Worker replies cross the VM boundary; keep only well-formed fields. */
export function readReply(data: unknown): ExecutionReply | undefined {
  if (!data || typeof data !== "object") return undefined;
  const reply = data as Record<string, unknown>;
  if (typeof reply.id !== "number") return undefined;
  const steps = readList(reply.steps, readResult);
  const results = readList(reply.results, readKeyed);
  return {
    id: reply.id,
    ...readResult(reply),
    ...(typeof reply.copy === "string" ? { copy: reply.copy } : {}),
    ...(steps ? { steps } : {}),
    ...(results ? { results } : {}),
    ...(typeof reply.fatal === "string" ? { fatal: reply.fatal } : {}),
  };
}
export interface ExecutionJob {
  /** "call", "declare" or "release" when queued; "batch" once dispatched. */
  type: string;
  payload: Record<string, unknown>;
  /** The evaluations a batch carries. */
  keys?: string[];
  /** The declarations and releases a batch carries, in order. */
  steps?: ExecutionJob[];
  setter?: string;
}
const DEADLINE = 1000;
// Jobs sent before the runtime first answers also wait for it to start, which
// includes creating the worker and instantiating QuickJS.
const STARTUP_DEADLINE = 5000;
// QuickJS interrupts each evaluation after its own work budget, so a batch
// needs time for every job it carries. A quarter of the single-job deadline
// per extra job leaves room for slow devices, while a VM that stops answering
// still fails in bounded time.
const PER_JOB_DEADLINE = 250;
/** The most evaluations one batch carries; the rest follow in the next. */
const BATCH_LIMIT = 512;
/**
 * Transport to the serial QuickJS worker. Declarations, releases and the
 * evaluations requested in the same task travel in one batch. Actions travel
 * alone, one at a time, so a queued setter stays replaceable until the VM
 * accepts the next action. Waiting evaluations never consume deadlines.
 */
export class ExecutionQueue {
  private next = 0;
  private answered = false;
  /** Jobs the worker has, in the order it runs them. */
  private pending = new Map<
    number,
    {
      job: ExecutionJob;
      size: number;
      timer?: ReturnType<typeof setTimeout> | undefined;
    }
  >();
  private evaluations = new Map<string, Record<string, unknown>>();
  private activeKeys = new Set<string>();
  private mutations: ExecutionJob[] = [];
  private setters = new Map<string, ExecutionJob>();
  private calls = 0;
  private draining = false;
  private scheduled = false;
  private stopped = false;
  /** Jobs wait, in order, while held: nothing reaches the worker during a render. */
  private held = false;
  hold() {
    this.held = true;
  }
  release() {
    this.held = false;
    this.schedule();
  }
  constructor(
    private readonly post: (message: Record<string, unknown>) => void,
    private readonly receive: (
      job: ExecutionJob,
      reply: ExecutionReply,
    ) => void,
    private readonly failure: (
      message: string,
      kind: "runtime" | "limit",
      code: DilRenderErrorCode,
    ) => void,
    private readonly dependents: () => Record<string, unknown>[] = () => [],
  ) {}
  get stats() {
    return {
      inFlight: this.pending.size,
      evaluations: this.activeKeys.size,
      queued: this.evaluations.size,
      mutations: this.mutations.length,
    };
  }
  /** Whether an evaluation or action is queued or awaiting its reply. */
  get idle() {
    return (
      !this.pending.size && !this.evaluations.size && !this.mutations.length
    );
  }
  has(key: string) {
    return this.evaluations.has(key) || this.activeKeys.has(key);
  }
  evaluate(key: string, payload: Record<string, unknown>) {
    if (this.stopped || this.has(key)) return true;
    if (this.evaluations.size >= 1024) return false;
    this.evaluations.set(key, payload);
    this.schedule();
    return true;
  }
  /**
   * Views retain their expressions one layout effect at a time, and a parsed
   * batch declares its state one statement at a time; the batch leaves once
   * the whole task has asked.
   */
  private schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.drain();
    });
  }
  cancel(key: string) {
    this.evaluations.delete(key);
  }
  mutate(job: ExecutionJob) {
    if (this.stopped) return;
    const previous = job.setter ? this.setters.get(job.setter) : undefined;
    const replaced = previous
      ? { ...previous, payload: previous.payload }
      : undefined;
    if (previous) previous.payload = job.payload;
    else {
      if (
        job.type === "call" &&
        this.mutations.filter((entry) => entry.type === "call").length >= 256
      ) {
        this.failure(
          "Execution stopped: too many actions were requested.",
          "limit",
          "action-limit",
        );
        return;
      }
      if (!job.setter) this.setters.clear();
      this.mutations.push(job);
      if (job.setter) this.setters.set(job.setter, job);
    }
    // A reader's action leaves at once; declarations join the task's batch.
    if (job.type === "call") this.drain();
    else this.schedule();
    return replaced;
  }
  reply(data: unknown) {
    const reply = readReply(data);
    if (!reply) return;
    const pending = this.pending.get(reply.id);
    if (!pending) return;
    this.answered = true;
    clearTimeout(pending.timer);
    this.pending.delete(reply.id);
    for (const key of pending.job.keys ?? []) this.activeKeys.delete(key);
    if (pending.job.type === "call") this.calls--;
    this.arm();
    this.receive(pending.job, reply);
    this.drain();
  }
  /**
   * The serial worker starts a job once it has answered the ones before it,
   * so only the oldest job's deadline runs. A job sent behind a large batch
   * would otherwise spend its own time limit waiting for that batch.
   */
  private arm() {
    const head = this.pending.values().next().value;
    if (!head || head.timer !== undefined || this.stopped) return;
    head.timer = setTimeout(
      () =>
        this.failure(
          "Execution stopped: the action exceeded its time limit.",
          "limit",
          "execution-timeout",
        ),
      (this.answered ? DEADLINE : STARTUP_DEADLINE) +
        PER_JOB_DEADLINE * Math.max(0, head.size - 1),
    );
  }
  private dispatch(job: ExecutionJob, size = 1) {
    const id = ++this.next;
    for (const key of job.keys ?? []) this.activeKeys.add(key);
    if (job.type === "call") this.calls++;
    this.pending.set(id, { job, size });
    this.arm();
    try {
      this.post({ id, type: job.type, ...job.payload });
    } catch {
      this.failure(
        "Message execution worker failed.",
        "runtime",
        "runtime-crashed",
      );
    }
  }
  private drain() {
    if (this.draining || this.stopped || this.held) return;
    this.draining = true;
    try {
      const steps: ExecutionJob[] = [];
      while (this.mutations.length) {
        const job = this.mutations[0];
        if (!job) break;
        if (job.type === "call") {
          // The VM executes serially. Keep later setters replaceable until it accepts the next action.
          if (this.calls > 0) break;
          this.batch(steps.splice(0), []);
          this.mutations.shift();
          if (job.setter && this.setters.get(job.setter) === job)
            this.setters.delete(job.setter);
          // Refreshes run in this reply, so their work shares its deadline.
          const dependents = this.dependents();
          this.dispatch(
            { ...job, payload: { ...job.payload, dependents } },
            1 + dependents.length,
          );
          continue;
        }
        steps.push(job);
        this.mutations.shift();
      }
      // Evaluations queued behind an action would read state it is about to change.
      const keys = this.mutations.length
        ? []
        : [...this.evaluations.keys()].slice(0, BATCH_LIMIT);
      this.batch(steps, keys);
    } finally {
      this.draining = false;
    }
  }
  private batch(steps: ExecutionJob[], keys: string[]) {
    if (!steps.length && !keys.length) return;
    const evaluations = keys.map((key) => {
      const payload = this.evaluations.get(key);
      this.evaluations.delete(key);
      return { key, ...payload };
    });
    this.dispatch(
      {
        type: "batch",
        keys,
        steps,
        payload: {
          steps: steps.map((step) => ({ type: step.type, ...step.payload })),
          evaluations,
        },
      },
      steps.length + keys.length,
    );
  }
  stop() {
    this.stopped = true;
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    this.activeKeys.clear();
    this.evaluations.clear();
    this.mutations = [];
    this.setters.clear();
    this.calls = 0;
  }
}
