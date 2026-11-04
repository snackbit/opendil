// Markdown constructs that make DIL source literal: fenced code and code spans.
// Each helper returns WAIT when a streamed chunk ends before the answer is known.
import { tagStart } from "./lexical";

export const WAIT = -1;
export interface Fence {
  char: string;
  length: number;
}
/** How far a scan starting at `from` has already looked. */
export interface Reach {
  from: number;
  to: number;
}
/**
 * Unresolved run and line scans. The source only grows, so a scan that waited
 * for more input resumes where it stopped instead of rescanning a long run.
 */
export interface ScanMemo {
  run: Reach;
  line: Reach;
}
export const scanMemo = (): ScanMemo => ({
  run: { from: -1, to: 0 },
  line: { from: -1, to: 0 },
});
type IsComponent = (name: string) => boolean;
const BLOCK_PREFIX = /^[ \t]*(?:(?:>|(?:[-+*]|\d{1,9}[.)])(?=[ \t]))[ \t]*)*$/;
// Line beginnings that a code span cannot continue into (bounded lookahead).
const BLOCK_LINE = new RegExp(
  [
    "^(?:```|~~~|>", // fence or blockquote
    "#{1,6}(?:[ \\t]|$)", // ATX heading
    "(?:[-+*]|\\d{1,9}[.)])(?:[ \\t]|$)", // list item
    "(?:-{3,}|={3,}|\\*{3,}|_{3,})[ \\t]*$", // thematic break or setext underline
    "\\{[#/:])", // DIL block directive
  ].join("|"),
);
const BLOCK_LOOKAHEAD = 12;
// A DIL closing tag or block directive may follow a closing fence on its line.
const FENCE_TRAIL = /^[ \t]*(?:<\/([A-Za-z][\w-]*)\s*>|\{[/:])/;

/** Length of the run of identical characters at cursor. */
export function runLength(
  source: string,
  cursor: number,
  complete: boolean,
  memo?: ScanMemo,
): number {
  const char = source.charAt(cursor);
  let end = memo?.run.from === cursor ? memo.run.to : cursor;
  while (source.charAt(end) === char) end++;
  if (memo) memo.run = { from: cursor, to: end };
  return end === source.length && !complete ? WAIT : end - cursor;
}

function lineEnd(
  source: string,
  from: number,
  complete: boolean,
  memo?: ScanMemo,
): number {
  const end = source.indexOf(
    "\n",
    memo?.line.from === from ? memo.line.to : from,
  );
  if (end !== -1) return end;
  if (memo) memo.line = { from, to: source.length };
  return complete ? source.length : WAIT;
}

/**
 * Whether only indentation, list markers, or blockquote markers precede cursor
 * on its line. The current Markdown block may also begin at floor, after a tag.
 */
export function atBlockStart(
  source: string,
  cursor: number,
  floor: number,
): boolean {
  let start = cursor;
  while (start > floor && source.charAt(start - 1) !== "\n") {
    if (cursor - start >= 64) return false;
    start--;
  }
  return BLOCK_PREFIX.test(source.slice(start, cursor));
}

/** An opening fence at cursor, null when there is none (CommonMark rules). */
export function openingFence(
  source: string,
  cursor: number,
  floor: number,
  complete: boolean,
  memo?: ScanMemo,
): Fence | null | typeof WAIT {
  const char = source.charAt(cursor);
  if ((char !== "`" && char !== "~") || !atBlockStart(source, cursor, floor))
    return null;
  const length = runLength(source, cursor, complete, memo);
  if (length === WAIT) return WAIT;
  if (length < 3) return null;
  if (char === "`") {
    // A backtick fence's info string cannot contain backticks; that is a code span.
    const end = lineEnd(source, cursor + length, complete, memo);
    if (end === WAIT) return WAIT;
    if (source.slice(cursor + length, end).includes("`")) return null;
  }
  return { char, length };
}

/**
 * Length of the closing fence at cursor, or 0 when the line does not close
 * fence. Besides spaces, only a DIL closing tag or block directive may follow it.
 */
export function closingFence(
  source: string,
  cursor: number,
  fence: Fence,
  complete: boolean,
  memo?: ScanMemo,
  isComponent: IsComponent = () => false,
): number {
  if (source.charAt(cursor) !== fence.char) return 0;
  if (!atBlockStart(source, cursor, 0)) return 0;
  const length = runLength(source, cursor, complete, memo);
  if (length === WAIT) return WAIT;
  if (length < fence.length) return 0;
  const end = lineEnd(source, cursor + length, complete, memo);
  if (end === WAIT) return WAIT;
  const rest = source.slice(cursor + length, end);
  if (!rest.trim()) return length;
  const trail = FENCE_TRAIL.exec(rest);
  return trail && (!trail[1] || isComponent(trail[1])) ? length : 0;
}

/**
 * Whether the line whose first non-blank character is at cursor starts a block
 * that a code span cannot continue into: a fence, blockquote, heading, list
 * item, thematic break, DIL block directive, or DIL component tag.
 */
export function blockLine(
  source: string,
  cursor: number,
  complete: boolean,
  isComponent: IsComponent,
): boolean | typeof WAIT {
  if (source.charAt(cursor) === "<") {
    const tag = tagStart(source, cursor, complete);
    return tag === undefined ? WAIT : !!tag && isComponent(tag.name);
  }
  const head = source.slice(cursor, cursor + BLOCK_LOOKAHEAD);
  const newline = head.indexOf("\n");
  if (newline === -1 && head.length < BLOCK_LOOKAHEAD && !complete) return WAIT;
  return BLOCK_LINE.test(newline === -1 ? head : head.slice(0, newline));
}
