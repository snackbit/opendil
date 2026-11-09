import { DilParser } from "../parser/dil-parser";
import { ParserSession } from "../parser/parser-session";
import type { StreamInput, TreeBatch } from "../parser/types";
import { DilDocument } from "./document";

/**
 * Text up to this length that the renderer has when it mounts is parsed in
 * the first render, so it has content immediately, including in server
 * rendering. Longer text parses in the worker.
 */
export const SYNC_PARSE_LIMIT = 16_384;
/** Parses the rest of a stream in the calling thread, with a worker's interface. */
export interface StreamParser {
  postMessage(input: StreamInput): void;
  /** Receives each reply; replies before mount went into the document. */
  onmessage: ((reply: TreeBatch) => void) | null;
}
export interface ParsedDocument {
  document: DilDocument;
  text: string;
  scanned: number;
  /** Present while the text may still grow. */
  stream?: StreamParser;
}
/**
 * Parses a complete document in the calling thread. Its reports are held
 * until the renderer releases them to the host's listeners. Returns null when
 * the worker must parse it because the initial text is too long.
 */
export function parseCompleteDocument(
  text: string,
  components: readonly string[],
): ParsedDocument | null {
  if (text.length > SYNC_PARSE_LIMIT) return null;
  const parser = new DilParser();
  parser.allow(components);
  const batch = parser.append(text, true);
  const document = new DilDocument();
  document.hold();
  document.apply(batch);
  document.settle();
  return { document, text, scanned: batch.scanned };
}
/**
 * Parses the text a stream already has, then each delta, in the calling
 * thread. A short prefix appears in the first commit without a parser
 * worker. Structural limits apply to every append. Returns null for a
 * prefix the worker must parse.
 */
export function parseStreamingDocument(
  text: string,
  components: readonly string[],
): ParsedDocument | null {
  if (text.length > SYNC_PARSE_LIMIT) return null;
  const replies: TreeBatch[] = [];
  const stream: StreamParser = {
    postMessage: (input) => session.receive(input),
    onmessage: null,
  };
  const session = new ParserSession(
    (reply) =>
      stream.onmessage ? stream.onmessage(reply) : replies.push(reply),
    // Chunks run one after another: the caller already chose to parse here.
    { schedule: (next) => next() },
  );
  session.receive({
    suffix: text,
    complete: false,
    components: [...components],
  });
  const document = new DilDocument();
  document.hold();
  let scanned = 0;
  for (const reply of replies) {
    document.apply(reply);
    scanned = reply.scanned;
  }
  document.settle();
  return {
    document,
    text,
    scanned,
    ...(document.status.getState().complete ? {} : { stream }),
  };
}
