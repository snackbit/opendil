import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
const parser = unified().use(remarkParse).use(remarkGfm);
export interface MarkdownBlock {
  offset: number;
  text: string;
}
export interface MarkdownSnapshot {
  source: string;
  offset: number;
  blocks: readonly MarkdownBlock[];
  complete: boolean;
  trailing?: MarkdownBlock;
}
export const EMPTY_MARKDOWN: MarkdownSnapshot = {
  source: "",
  offset: 0,
  blocks: [],
  complete: false,
};
/** Block splits of finished prose, most recently used last. */
const SPLIT = new Map<string, MarkdownSnapshot>();
// A few hundred prose nodes: the dozen finished answers the document cache
// keeps. Each entry holds its source about twice (key and blocks), so the
// character budget bounds what a long history of large answers keeps alive.
const SPLIT_LIMIT = 512;
const SPLIT_CHARACTERS = 4_000_000;
let splitCharacters = 0;
function rememberSplit(snapshot: MarkdownSnapshot) {
  if (snapshot.source.length > SPLIT_CHARACTERS) return;
  SPLIT.set(snapshot.source, snapshot);
  splitCharacters += snapshot.source.length;
  for (const [oldest, { source }] of SPLIT) {
    if (SPLIT.size <= SPLIT_LIMIT && splitCharacters <= SPLIT_CHARACTERS) break;
    SPLIT.delete(oldest);
    splitCharacters -= source.length;
  }
}
/** Only the trailing block is reparsed; completed blocks keep their values and keys. */
export function advanceMarkdown(
  previous: MarkdownSnapshot,
  source: string,
  complete: boolean,
): MarkdownSnapshot {
  if (previous.source === source && previous.complete === complete)
    return previous;
  // Once complete, even an appended character can change the last block.
  const base =
    !previous.complete && source.startsWith(previous.source)
      ? previous
      : EMPTY_MARKDOWN;
  if (complete && base === EMPTY_MARKDOWN) {
    // A finished answer that mounts again, as a virtualized row, splits
    // its prose into the same blocks.
    const known = SPLIT.get(source);
    if (known) {
      SPLIT.delete(source);
      SPLIT.set(source, known);
      return known;
    }
  }
  const tail = source.slice(base.offset);
  const nodes = parser.parse(tail).children;
  // remark-parse always supplies offsets; this parser has no transforms that remove positions.
  const next = nodes.map((node) => {
    const position = node.position!;
    const start = position.start.offset!,
      end = position.end.offset!;
    return { offset: base.offset + start, text: tail.slice(start, end) };
  });
  const finalized = complete ? next : next.slice(0, -1);
  const lastFinal = finalized.at(-1);
  const offset = lastFinal
    ? lastFinal.offset + lastFinal.text.length
    : base.offset;
  const trailing = complete ? undefined : next.at(-1);
  const snapshot: MarkdownSnapshot = {
    source,
    offset,
    complete,
    blocks: [...base.blocks, ...finalized],
    ...(trailing ? { trailing } : {}),
  };
  if (complete && base === EMPTY_MARKDOWN) rememberSplit(snapshot);
  return snapshot;
}
export function currentMarkdown(
  snapshot: MarkdownSnapshot,
): readonly MarkdownBlock[] {
  if (
    !snapshot.complete &&
    snapshot.trailing &&
    /^\s*(?:#{1,6}|`{1,2}|~{1,2}|\*{1,2}|[-+]|\d+\.)\s*$/.test(
      snapshot.trailing.text,
    )
  )
    return snapshot.blocks;
  return snapshot.trailing
    ? [...snapshot.blocks, snapshot.trailing]
    : snapshot.blocks;
}
export function markdownIndent(source: string): number | undefined {
  return /(?:^|\n)( *)(\S)/.exec(source)?.[1]?.length;
}
export function normalizeMarkdown(source: string, indentation: number): string {
  if (!indentation) return source;
  return source
    .split("\n")
    .map((line) => line.replace(new RegExp("^ {0," + indentation + "}"), ""))
    .join("\n");
}
