import { DilParser } from "./dil-parser";
import type { ParserStop, StreamInput } from "./types";

const MAX_NODES = 100000;
const parser = new DilParser();
const queue: StreamInput[] = [];
let scheduled = false;
let stopped = false;

function processNext() {
  const request = queue.shift();
  if (!request) {
    scheduled = false;
    return;
  }
  // Registered names apply to tags that start in this request's text and later.
  if (request.components) parser.allow(request.components);
  // Bounded chunks keep parsing cooperative even on an initial megabyte snapshot.
  const suffix = request.suffix.slice(0, 16384);
  const remaining = request.suffix.slice(16384);
  if (remaining)
    queue.unshift({ suffix: remaining, complete: request.complete });
  const batch = parser.append(suffix, request.complete && !remaining);
  if (batch.nodes.some((node) => node.id >= MAX_NODES)) {
    // The batch over the limit is dropped and later input is ignored.
    stopped = true;
    queue.length = 0;
    const stop: ParserStop = {
      stopped: "limit",
      message:
        "Rendering stopped: this message has more parts than the renderer supports.",
    };
    self.postMessage(stop);
    return;
  }
  self.postMessage(batch);
  setTimeout(processNext, 0);
}

self.onmessage = (event: MessageEvent<StreamInput>) => {
  if (stopped) return;
  queue.push(event.data);
  if (!scheduled) {
    scheduled = true;
    processNext();
  }
};
