export interface AutoScrollOptions {
  behavior?: "instant" | "smooth";
  /** Extra distance beyond the message tail, clamped to available document space. */
  padding?: number;
}
export type AutoScroll = boolean | AutoScrollOptions;
export function scrollSettings(value: AutoScroll) {
  if (value === false) return null;
  const behavior = value === true ? "instant" : (value.behavior ?? "instant");
  const padding = value === true ? 0 : (value.padding ?? 0);
  if (behavior !== "instant" && behavior !== "smooth")
    throw new Error("Auto-scroll behavior must be instant or smooth.");
  if (!Number.isFinite(padding) || padding < 0)
    throw new Error("Auto-scroll padding must be a finite nonnegative number.");
  return { behavior, padding };
}
