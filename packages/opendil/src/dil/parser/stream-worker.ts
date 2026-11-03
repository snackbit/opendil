import { DilParser } from "./dil-parser";
import type { StreamInput } from "./types";

const parser = new DilParser();
const queue: StreamInput[] = [];
let scheduled = false;

function processNext() {
  const request = queue.shift();
  if (!request) {
    scheduled = false;
    return;
  }
  // Bounded chunks keep parsing cooperative even on an initial megabyte snapshot.
  const suffix = request.suffix.slice(0, 16384);
  const remaining = request.suffix.slice(16384);
  if (remaining)
    queue.unshift({ suffix: remaining, complete: request.complete });
  const batch = parser.append(suffix, request.complete && !remaining);
  if (batch.nodes.some((node) => node.id >= 100000))
    throw new Error("Message node limit exceeded");
  self.postMessage(batch);
  setTimeout(processNext, 0);
}

self.onmessage = (event: MessageEvent<StreamInput>) => {
  queue.push(event.data);
  if (!scheduled) {
    scheduled = true;
    processNext();
  }
};
