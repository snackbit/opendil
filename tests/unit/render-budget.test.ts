import { expect, it } from "vitest";
import { RenderBudget } from "../../packages/opendil/src/dil/runtime/render-budget";
it("keeps repeated reservations idempotent and accounts for changes", () => {
  const budget = new RenderBudget(3);
  expect(budget.reserve("a", 1)).toBe(true);
  expect(budget.reserve("a", 1)).toBe(true);
  expect(budget.reserve("b", 2)).toBe(true);
  expect(budget.reserve("a", 2)).toBe(false);
  budget.release("b");
  expect(budget.reserve("a", 3)).toBe(true);
  expect(budget.reserve("c", 1)).toBe(false);
});
it("rejects invalid costs and releases unknown or zero-cost leases safely", () => {
  const budget = new RenderBudget();
  expect(budget.reserve("bad", NaN)).toBe(false);
  expect(budget.reserve("bad", -1)).toBe(false);
  expect(budget.reserve("zero", 0)).toBe(true);
  budget.release("unknown");
  budget.release("zero");
  expect(budget.reserve("full", 2000)).toBe(true);
});
