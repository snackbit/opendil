import { tokenOffsets } from "./token-index";
self.onmessage = (event: MessageEvent<unknown>) => {
  if (typeof event.data !== "string") {
    self.postMessage({ error: "Invalid replay source." });
    return;
  }
  try {
    const offsets = tokenOffsets(event.data);
    self.postMessage({ offsets }, { transfer: [offsets.buffer] });
  } catch {
    self.postMessage({ error: "Could not tokenize this source losslessly." });
  }
};
