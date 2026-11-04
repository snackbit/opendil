/**
 * What went wrong:
 * - `incomplete`: the document was finalized with unfinished structure, for
 *   example because the reader stopped the response, the model reached its
 *   output limit, or the stream failed.
 * - `syntax`: the source contains malformed DIL or names a component that is
 *   neither a stock component nor one passed in `components`.
 * - `runtime`: the parser, the expression runtime, or the iframe runtime
 *   failed, was blocked by the page's security policy, or a declaration failed;
 *   or, once the message is final, an expression could not be evaluated or a
 *   component failed to render.
 * - `limit`: a size, display, or execution limit stopped the message.
 * - `source`: `text` changed in an unsupported way, such as being replaced or
 *   growing after the message was finalized.
 */
export type DilRenderErrorKind =
  "incomplete" | "syntax" | "runtime" | "limit" | "source";
export interface DilRenderError {
  kind: DilRenderErrorKind;
  /** Developer-facing description. Readers see shorter wording. */
  message: string;
  /** Position in `text`, in UTF-16 code units, when the error has one. */
  offset?: number;
}
/** Reader-facing wording for a part of the message that cannot be shown. */
export const UNSHOWN_PART_MESSAGE =
  "This part of the response couldn't be shown.";

const KINDS: ReadonlySet<string> = new Set<DilRenderErrorKind>([
  "incomplete",
  "syntax",
  "runtime",
  "limit",
  "source",
]);
const MAX_MESSAGE = 2000;
/** Problems reported for one message before the rest are summarized. */
export const MAX_REPORTED_PROBLEMS = 20;
export const UNREPORTED_PROBLEMS = `This message has more than ${MAX_REPORTED_PROBLEMS} problems; later ones are not reported.`;

/**
 * Decides what reaches `onError` for one message: each distinct problem once,
 * at most MAX_REPORTED_PROBLEMS of them followed by one `limit` notice, and
 * the end-of-document report once. Messages are bounded in every mode.
 */
export class ProblemReports {
  private readonly seen = new Set<string>();
  private count = 0;
  private ended = false;
  /** Returns the error to report for this problem, or undefined to drop it. */
  take(problem: DilRenderError): DilRenderError | undefined {
    const error = {
      ...problem,
      message: problem.message.slice(0, MAX_MESSAGE),
    };
    // A message ends once, so this report needs no share of the budget.
    if (error.kind === "incomplete") {
      if (this.ended) return undefined;
      this.ended = true;
      return error;
    }
    const key = `${error.offset ?? ""}:${error.message}`;
    if (this.count > MAX_REPORTED_PROBLEMS || this.seen.has(key))
      return undefined;
    this.count++;
    if (this.count > MAX_REPORTED_PROBLEMS)
      return { kind: "limit", message: UNREPORTED_PROBLEMS };
    this.seen.add(key);
    return error;
  }
}

/**
 * Calls the host's handler. An exception it throws must not interrupt
 * rendering, so it is rethrown asynchronously, like an event handler's.
 */
export function deliverError(
  onError: ((error: DilRenderError) => void) | undefined,
  error: DilRenderError,
) {
  try {
    onError?.(error);
  } catch (thrown) {
    queueMicrotask(() => {
      throw thrown;
    });
  }
}

/** Validates an error received from the iframe runtime. */
export function readRenderError(value: unknown): DilRenderError | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { kind, message, offset } = value as Record<string, unknown>;
  if (typeof kind !== "string" || !KINDS.has(kind)) return undefined;
  if (typeof message !== "string") return undefined;
  const error: DilRenderError = {
    kind: kind as DilRenderErrorKind,
    message: message.slice(0, MAX_MESSAGE),
  };
  if (offset === undefined) return error;
  if (
    typeof offset !== "number" ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 5_000_000
  )
    return undefined;
  return { ...error, offset };
}
