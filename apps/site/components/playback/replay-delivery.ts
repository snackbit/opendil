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
