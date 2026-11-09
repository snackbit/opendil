import { DilParser } from "./dil-parser";
import type { ParserReply, ParserStop, StreamInput } from "./types";

const CHUNK = 16384;
export const MAX_NODES = 100000;
export interface ParserSessionOptions {
  /** Runs the next chunk later, so parsing stays cooperative. */
  schedule: (next: () => void) => void;
  maxNodes?: number;
}
/**
 * The parser worker's protocol: streamed input is parsed in bounded chunks,
 * one reply per chunk, until the document exceeds its node limit.
 */
export class ParserSession {
  private readonly parser = new DilParser();
  private readonly queue: StreamInput[] = [];
  private scheduled = false;
  private stopped = false;
  constructor(
    private readonly post: (reply: ParserReply) => void,
    private readonly options: ParserSessionOptions,
  ) {}
  receive(input: StreamInput) {
    if (this.stopped) return;
    this.queue.push(input);
    if (!this.scheduled) {
      this.scheduled = true;
      this.next();
    }
  }
  private readonly next = () => {
    const request = this.queue.shift();
    if (!request) {
      this.scheduled = false;
      return;
    }
    // Registered names apply to tags that start in this request's text and later.
    if (request.components) this.parser.allow(request.components);
    // Bounded chunks keep parsing cooperative even on an initial megabyte snapshot.
    const suffix = request.suffix.slice(0, CHUNK);
    const remaining = request.suffix.slice(CHUNK);
    if (remaining)
      this.queue.unshift({ suffix: remaining, complete: request.complete });
    const batch = this.parser.append(suffix, request.complete && !remaining);
    const maxNodes = this.options.maxNodes ?? MAX_NODES;
    if (batch.nodes.some((node) => node.id >= maxNodes)) {
      // The batch over the limit is dropped and later input is ignored.
      this.stopped = true;
      this.queue.length = 0;
      const stop: ParserStop = {
        stopped: "limit",
        message:
          "Rendering stopped: this message has more parts than the renderer supports.",
      };
      this.post(stop);
      return;
    }
    this.post(batch);
    this.options.schedule(this.next);
  };
}
