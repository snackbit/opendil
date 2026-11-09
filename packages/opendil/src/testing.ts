import {
  INLINE_WORKER_HOOK,
  PARSER_WORKER_ROLE,
  type InlineWorkerFactory,
  type InlineWorkerPort,
} from "./dil/runtime/inline-worker-hook";
import { ParserSession } from "./dil/parser/parser-session";
import type { StreamInput } from "./dil/parser/types";

/** Runs the document parser in the calling thread, with a worker's interface. */
class InlineParserWorker implements InlineWorkerPort {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event?: Event) => void) | null = null;
  private terminated = false;
  private readonly session = new ParserSession(
    (reply) => {
      if (!this.terminated) this.onmessage?.({ data: reply } as MessageEvent);
    },
    { schedule: (next) => queueMicrotask(next) },
  );
  postMessage(message: unknown) {
    if (this.terminated) return;
    // A worker answers asynchronously; so does this one.
    queueMicrotask(() => this.session.receive(message as StreamInput));
  }
  terminate() {
    this.terminated = true;
  }
}
/**
 * Lets OpenDIL's host and Shadow DOM renderers run where blob: workers do not,
 * such as jsdom and happy-dom tests. The document parser runs in the calling
 * thread, so Markdown, components, and JSON literal expressions render. Other
 * expressions and state never run: the document reports `runtime` errors
 * with code `worker-blocked-policy`. Returns a function that restores the
 * previous state.
 */
export function installInlineWorkers(): () => void {
  const slot = globalThis as { [INLINE_WORKER_HOOK]?: InlineWorkerFactory };
  const previous = slot[INLINE_WORKER_HOOK];
  slot[INLINE_WORKER_HOOK] = (role) =>
    role === PARSER_WORKER_ROLE ? new InlineParserWorker() : "blocked";
  return () => {
    if (previous) slot[INLINE_WORKER_HOOK] = previous;
    else delete slot[INLINE_WORKER_HOOK];
  };
}
