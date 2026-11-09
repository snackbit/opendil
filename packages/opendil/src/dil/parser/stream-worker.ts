import { ParserSession } from "./parser-session";
import type { StreamInput } from "./types";

const session = new ParserSession((reply) => self.postMessage(reply), {
  schedule: (next) => setTimeout(next, 0),
});
self.onmessage = (event: MessageEvent<StreamInput>) =>
  session.receive(event.data);
