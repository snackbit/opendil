import { encode, decodeGenerator } from "gpt-tokenizer/encoding/o200k_base";
/** Each entry is an exact source prefix after that many tokens, with incomplete Unicode held back. */
export function tokenOffsets(source: string): Uint32Array {
  const tokens = encode(source, { disallowedSpecial: new Set() });
  const offsets = new Uint32Array(tokens.length + 1);
  let consumed = 0,
    filled = 0,
    length = 0;
  function* counted() {
    for (const token of tokens) {
      consumed++;
      yield token;
    }
  }
  for (const chunk of decodeGenerator(counted())) {
    while (filled < consumed - 1) offsets[++filled] = length;
    if (source.slice(length, length + chunk.length) !== chunk)
      throw new Error("Source cannot be replayed losslessly.");
    length += chunk.length;
    offsets[consumed] = length;
    filled = consumed;
  }
  return offsets;
}
