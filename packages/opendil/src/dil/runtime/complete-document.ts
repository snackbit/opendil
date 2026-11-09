import { DilParser } from "../parser/dil-parser";
import { MAX_NODES, ParserSession } from "../parser/parser-session";
import type { ParserReply, StreamInput, TreeBatch } from "../parser/types";
import { DilDocument } from "./document";

/**
 * Text up to this length that the renderer has when it mounts is parsed in
 * the first render, so it has content immediately, including in server
 * rendering. Longer text parses in the worker.
 */
export const SYNC_PARSE_LIMIT = 1_048_576;
/** Parses the rest of a stream in the calling thread, with a worker's interface. */
export interface StreamParser {
  postMessage(input: StreamInput): void;
  /** Receives each reply; replies before mount went into the document. */
  onmessage: ((reply: ParserReply) => void) | null;
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
 * the worker must parse it: the text is too long, or it exceeds the node
 * limit, which the worker reports.
 */
export function parseCompleteDocument(
  text: string,
  components: readonly string[],
): ParsedDocument | null {
  if (text.length > SYNC_PARSE_LIMIT) return null;
  const parser = new DilParser();
  parser.allow(components);
  const batch = parser.append(text, true);
  if (batch.nodes.some((node) => node.id >= MAX_NODES)) return null;
  const document = new DilDocument();
  document.hold();
  document.apply(batch);
  document.settle();
  return { document, text, scanned: batch.scanned };
}
/**
 * Parses the text a stream already has, then each delta, in the calling
 * thread. Parsing a delta takes microseconds, so a renderer that mounts
 * mid-stream shows its prefix in the first commit and starts no parser
 * worker. Returns null for a prefix the worker must parse.
 */
export function parseStreamingDocument(
  text: string,
  components: readonly string[],
): ParsedDocument | null {
  if (text.length > SYNC_PARSE_LIMIT) return null;
  const replies: ParserReply[] = [];
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
  if (replies.some((reply) => "stopped" in reply)) return null;
  const document = new DilDocument();
  document.hold();
  let scanned = 0;
  for (const reply of replies) {
    document.apply(reply as TreeBatch);
    scanned = (reply as TreeBatch).scanned;
  }
  document.settle();
  return { document, text, scanned, stream };
}
