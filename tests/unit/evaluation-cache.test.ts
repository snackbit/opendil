import { expect, it } from "vitest";
import { EvaluationCache } from "../../packages/opendil/src/dil/runtime/evaluation-cache";
it("bounds inactive entries while preserving active and recent values", () => {
  const cache = new EvaluationCache();
  for (let index = 0; index < 2500; index++) cache.ensure(String(index), {});
  const first = cache.ensure("0", {});
  first.entry.owners = 1;
  const recent = cache.ensure("1", {});
  cache.touch(recent.key);
  cache.touch("missing");
  const evicted: string[] = [];
  cache.prune(
    () => false,
    (key) => evicted.push(key),
  );
  expect(cache.entries.size).toBe(2049);
  expect(cache.entries.has(first.key)).toBe(true);
  expect(cache.entries.has(recent.key)).toBe(true);
  expect(evicted).toHaveLength(451);
});
it("does not discard waiting one-shot work or in-flight entries", () => {
  const cache = new EvaluationCache();
  for (let index = 0; index < 2050; index++) cache.ensure(String(index), {});
  const oneShot = cache.ensure("0", {});
  oneShot.entry.oneShot = true;
  const busy = cache.ensure("1", {});
  cache.prune(
    (key) => key === busy.key,
    () => {},
  );
  expect(cache.entries.has(oneShot.key)).toBe(true);
  expect(cache.entries.has(busy.key)).toBe(true);
});
