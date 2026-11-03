export interface ProgressiveRevealOptions {
  staggerMs?: number;
  durationMs?: number;
}
export type ProgressiveReveal = boolean | ProgressiveRevealOptions;
export interface RevealTiming {
  staggerMs: number;
  durationMs: number;
}
function timing(value: number | undefined, fallback: number) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 0)
    throw new Error("Reveal timings must be finite nonnegative numbers.");
  return value;
}
export function revealTiming(value: ProgressiveReveal): RevealTiming | null {
  if (value === false) return null;
  return {
    staggerMs: timing(value === true ? undefined : value.staggerMs, 50),
    durationMs: timing(value === true ? undefined : value.durationMs, 180),
  };
}
export function readReveal(value: unknown): ProgressiveReveal {
  if (typeof value === "boolean") return value;
  if (!value || typeof value !== "object") return false;
  const options: ProgressiveRevealOptions = {};
  for (const key of ["staggerMs", "durationMs"] as const) {
    if (!(key in value)) continue;
    const entry: unknown = Reflect.get(value, key);
    if (typeof entry !== "number" || !Number.isFinite(entry) || entry < 0)
      return false;
    options[key] = entry;
  }
  return options;
}
