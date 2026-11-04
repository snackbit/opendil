/** Offsets are UTF-16, matching Monaco's model positions and source slicing. */
export function upcomingRange(length: number, received: number) {
  const start = Math.max(0, Math.min(length, received));
  return start < length ? { start, end: length } : null;
}
