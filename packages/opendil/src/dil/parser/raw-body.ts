import { WAIT } from "./markdown-lexing";

/** Components whose children are raw text up to their exact closing tag. */
export const RAW_TAGS: ReadonlySet<string> = new Set(["CodeBlock", "Markdown"]);
/** Finalized source ends inside the closing tag. */
export const CUT = -2;
/**
 * Inside a raw body: the closing tag's length when it starts at cursor, CUT
 * when finalized source ends inside it, WAIT while streamed source may still
 * complete it, and 0 otherwise.
 */
export function rawClosing(
  source: string,
  cursor: number,
  closing: string,
  complete: boolean,
): number {
  const available = source.slice(cursor, cursor + closing.length);
  if (!closing.startsWith(available)) return 0;
  if (available.length < closing.length) return complete ? CUT : WAIT;
  return closing.length;
}
