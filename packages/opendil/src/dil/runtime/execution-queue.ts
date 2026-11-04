export interface ExecutionReply {
  id: number;
  value?: unknown;
  error?: string;
  changed?: boolean;
  revision?: number;
  dependencies?: string[];
  bindings?: string[];
  handles?: number[];
  copy?: string;
  /** The VM can no longer be trusted; the document must stop. */
  fatal?: string;
}
function strings(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? (value as string[])
    : undefined;
}
/** Worker replies cross the VM boundary; keep only well-formed fields. */
export function readReply(data: unknown): ExecutionReply | undefined {
  if (!data || typeof data !== "object") return undefined;
  const reply = data as Record<string, unknown>;
  if (typeof reply.id !== "number") return undefined;
  const dependencies = strings(reply.dependencies);
  const bindings = strings(reply.bindings);
  const handles =
    Array.isArray(reply.handles) &&
    reply.handles.every((item) => Number.isSafeInteger(item) && item >= 0)
      ? (reply.handles as number[])
      : undefined;
  return {
    id: reply.id,
    ...("value" in reply ? { value: reply.value } : {}),
    ...(typeof reply.error === "string" ? { error: reply.error } : {}),
    ...(reply.changed === true ? { changed: true } : {}),
    ...(typeof reply.revision === "number" && Number.isFinite(reply.revision)
      ? { revision: reply.revision }
      : {}),
    ...(dependencies ? { dependencies } : {}),
    ...(bindings ? { bindings } : {}),
    ...(handles ? { handles } : {}),
    ...(typeof reply.copy === "string" ? { copy: reply.copy } : {}),
    ...(typeof reply.fatal === "string" ? { fatal: reply.fatal } : {}),
  };
}
export interface ExecutionJob {
  type: string;
  payload: Record<string, unknown>;
  key?: string;
  setter?: string;
}
const DEADLINE = 1000;
// Jobs sent before the runtime first answers also wait for it to start, which
// includes creating the worker and instantiating QuickJS.
const STARTUP_DEADLINE = 5000;
/** Bounded transport window; waiting evaluations never consume execution deadlines. */
export class ExecutionQueue {
  private next = 0;
  private answered = false;
  private pending = new Map<
    number,
    { job: ExecutionJob; timer: ReturnType<typeof setTimeout> }
  >();
  private evaluations = new Map<string, ExecutionJob>();
  private activeKeys = new Set<string>();
  private mutations: ExecutionJob[] = [];
  private setters = new Map<string, ExecutionJob>();
  private draining = false;
  private stopped = false;
  constructor(
    private readonly post: (message: Record<string, unknown>) => void,
    private readonly receive: (
      job: ExecutionJob,
      reply: ExecutionReply,
    ) => void,
    private readonly failure: (
      message: string,
      kind: "runtime" | "limit",
    ) => void,
  ) {}
  get stats() {
    return {
      inFlight: this.pending.size,
      evaluations: this.activeKeys.size,
      queued: this.evaluations.size,
      mutations: this.mutations.length,
    };
  }
  has(key: string) {
    return this.evaluations.has(key) || this.activeKeys.has(key);
  }
  evaluate(key: string, payload: Record<string, unknown>) {
    if (this.stopped || this.has(key)) return true;
    if (this.evaluations.size >= 1024) return false;
    this.evaluations.set(key, { type: "evaluate", key, payload });
    this.drain();
    return true;
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
        );
        return;
      }
      if (!job.setter) this.setters.clear();
      this.mutations.push(job);
      if (job.setter) this.setters.set(job.setter, job);
    }
    this.drain();
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
    if (pending.job.key) this.activeKeys.delete(pending.job.key);
    this.receive(pending.job, reply);
    this.drain();
  }
  private dispatch(job: ExecutionJob) {
    const id = ++this.next;
    if (job.key) this.activeKeys.add(job.key);
    if (job.setter && this.setters.get(job.setter) === job)
      this.setters.delete(job.setter);
    this.pending.set(id, {
      job,
      timer: setTimeout(
        () =>
          this.failure(
            "Execution stopped: the action exceeded its time limit.",
            "limit",
          ),
        this.answered ? DEADLINE : STARTUP_DEADLINE,
      ),
    });
    try {
      this.post({ id, type: job.type, ...job.payload });
    } catch {
      this.failure("Message execution worker failed.", "runtime");
    }
  }
  private drain() {
    if (this.draining || this.stopped) return;
    this.draining = true;
    try {
      let mutations = this.pending.size - this.activeKeys.size;
      // The VM executes serially. Keep later setters replaceable until it accepts the next action.
      while (this.mutations.length && mutations < 1) {
        const job = this.mutations.shift();
        if (job) {
          this.dispatch(job);
          mutations++;
        }
      }
      if (this.mutations.length) return;
      for (const [key, job] of this.evaluations) {
        if (this.activeKeys.size >= 4) break;
        this.evaluations.delete(key);
        this.dispatch(job);
      }
    } finally {
      this.draining = false;
    }
  }
  stop() {
    this.stopped = true;
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    this.activeKeys.clear();
    this.evaluations.clear();
    this.mutations = [];
    this.setters.clear();
  }
}
