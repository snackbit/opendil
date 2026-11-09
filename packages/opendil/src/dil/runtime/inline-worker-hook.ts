/**
 * Global slot through which `@snackbit/opendil/testing` replaces OpenDIL's
 * blob: workers in environments that have none, such as jsdom. Symbol.for
 * keeps it shared between separately bundled package entries.
 */
export const INLINE_WORKER_HOOK = Symbol.for(
  "@snackbit/opendil/inline-workers",
);
/** The role name the document parser's worker starts with. */
export const PARSER_WORKER_ROLE = "document parser";
/** The worker surface OpenDIL uses. */
export interface InlineWorkerPort {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event?: Event) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}
/** Returns a replacement worker for a role, or "blocked" to refuse it. */
export type InlineWorkerFactory = (
  role: string,
) => InlineWorkerPort | "blocked";
export function inlineWorkerFactory(): InlineWorkerFactory | undefined {
  return (globalThis as { [INLINE_WORKER_HOOK]?: InlineWorkerFactory })[
    INLINE_WORKER_HOOK
  ];
}
