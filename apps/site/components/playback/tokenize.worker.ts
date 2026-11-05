import { approximateOffsets } from "./replay-delivery";
// The tokenizer loads lazily: Safari can fail to evaluate its Unicode tables, and the
// replay then paces by approximate tokens instead of not starting at all.
self.onmessage = async (event: MessageEvent<unknown>) => {
  if (typeof event.data !== "string") {
    self.postMessage({ error: "Invalid replay source." });
    return;
  }
  let offsets: Uint32Array;
  try {
    const { tokenOffsets } = await import("./token-index");
    offsets = tokenOffsets(event.data);
  } catch {
    offsets = approximateOffsets(event.data);
  }
  self.postMessage({ offsets });
};
