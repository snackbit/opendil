export type StressSpeed = "1" | "4" | "16";
/** Character workloads are explicit benchmarks, never the normal token-rate control. */
export function stressChunk(dataset: string, profile: StressSpeed) {
  return (dataset === "large" ? 4096 : 128) * Number(profile);
}
export function ratePosition(rate: number) {
  return (Math.log10(rate) / 3) * 1000;
}
export function positionRate(position: number) {
  return Math.max(1, Math.min(1000, Math.round(10 ** ((3 * position) / 1000))));
}
export function validRate(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 1000;
}
type CharacterKind = "space" | "word" | "symbol";
function characterKind(code: number): CharacterKind {
  if (code <= 32) return "space";
  if (
    code >= 128 ||
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95
  )
    return "word";
  return "symbol";
}
/**
 * Approximate token offsets for when the tokenizer cannot load (Safari rejects its
 * worker): word runs in chunks of up to four characters, each ASCII symbol alone,
 * whitespace runs whole. Same contract as tokenOffsets: exact source prefixes
 * that never end inside a surrogate pair.
 */
export function approximateOffsets(source: string): Uint32Array {
  const offsets = [0];
  let index = 0;
  while (index < source.length) {
    // Like BPE vocabularies, a single space leads the word that follows it.
    const leading =
      source.charCodeAt(index) === 32 &&
      characterKind(source.charCodeAt(index + 1)) === "word"
        ? 1
        : 0;
    const kind = characterKind(source.charCodeAt(index + leading));
    const limit = kind === "word" ? index + leading + 4 : source.length;
    let end = index + leading + 1;
    if (kind !== "symbol")
      while (
        end < limit &&
        end < source.length &&
        characterKind(source.charCodeAt(end)) === kind
      )
        end++;
    const last = source.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff && end < source.length) end++;
    offsets.push(end);
    index = end;
  }
  return Uint32Array.from(offsets);
}
/** Token offsets as comma-separated base-36 token lengths, compact enough to ship in page props. */
export function packOffsets(offsets: Uint32Array): string {
  return Array.from(offsets.subarray(1), (offset, index) =>
    (offset - (offsets[index] ?? 0)).toString(36),
  ).join(",");
}
export function unpackOffsets(packed: string): Uint32Array {
  const lengths = packed ? packed.split(",") : [];
  const offsets = new Uint32Array(lengths.length + 1);
  lengths.forEach((length, index) => {
    offsets[index + 1] = (offsets[index] ?? 0) + parseInt(length, 36);
  });
  return offsets;
}
/** Fractional credit survives pauses and rate changes; timestamps never include hidden time. */
export class ReplayClock {
  tokens = 0;
  private credit = 0;
  constructor(
    private previous: number,
    private rate: number,
  ) {}
  rebase(now: number) {
    this.previous = now;
  }
  advance(now: number) {
    this.credit += (Math.max(0, now - this.previous) * this.rate) / 1000;
    this.previous = now;
    const whole = Math.floor(this.credit + 1e-9);
    this.credit -= whole;
    this.tokens += whole;
    return this.tokens;
  }
  setRate(now: number, rate: number) {
    this.advance(now);
    this.rate = rate;
  }
}
