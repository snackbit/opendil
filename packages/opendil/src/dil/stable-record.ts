import { useEffect, useMemo, useRef, useState } from "react";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
/** Same keys and values, comparing plain objects up to `depth` levels deep. */
export function sameRecord(a: unknown, b: unknown, depth: number): boolean {
  if (Object.is(a, b)) return true;
  if (depth === 0 || !isPlainRecord(a) || !isPlainRecord(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) => Object.hasOwn(b, key) && sameRecord(a[key], b[key], depth - 1),
    )
  );
}
// Customization records nest at most this deep: componentConfig's
// tag → option → value, with one more level for an option that is an object.
const CUSTOMIZATION_DEPTH = 3;
/**
 * Keeps the earlier object while a new one has the same content, so a host
 * that writes customization props as inline literals does not re-render every
 * widget, or change contexts, on each of its own renders.
 */
export function useStableRecord<T>(value: T): T {
  const [stable, setStable] = useState(value);
  if (sameRecord(stable, value, CUSTOMIZATION_DEPTH)) return stable;
  // Storing information from earlier renders, as React documents it.
  setStable(value);
  return value;
}
/**
 * A function that always calls the latest `callback`; its identity changes
 * only when the callback appears or goes away.
 */
export function useLatestCallback<Args extends unknown[]>(
  callback: ((...args: Args) => void) | undefined,
): ((...args: Args) => void) | undefined {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  }, [callback]);
  const present = callback !== undefined;
  return useMemo(
    () =>
      present
        ? (...args: Args) => {
            latest.current?.(...args);
          }
        : undefined,
    [present],
  );
}
