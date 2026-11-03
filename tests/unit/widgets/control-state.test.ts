import { expect, it } from "vitest";
import { ActionReceipt } from "../../../packages/opendil/src/dil/runtime/action-receipt";
import {
  editDraft,
  synchronizeDraft,
} from "../../../packages/opendil/src/dil/widgets/control-state";
it("keeps newer text until the corresponding worker evaluation catches up", () => {
  const initial = { upstream: "", value: "", revision: 0, pending: 0 };
  const first = editDraft(initial, "a", new ActionReceipt(1), true);
  const latest = editDraft(first, "ab", new ActionReceipt(2), true);
  expect(synchronizeDraft(latest, "a", 1)).toBe(latest);
  expect(synchronizeDraft(latest, "ab", 2)).toEqual({
    upstream: "ab",
    value: "ab",
    revision: 2,
    pending: 0,
  });
  expect(synchronizeDraft(latest, "", 3).value).toBe("");
});
it("keeps composition local and handles unchanged or unacknowledged controls", () => {
  const initial = { upstream: "old", value: "old", revision: 1, pending: 0 };
  expect(synchronizeDraft(initial, "old", 1)).toBe(initial);
  const composing = editDraft(initial, "新", undefined, false);
  expect(synchronizeDraft(composing, "stale", 100)).toBe(composing);
  const committed = editDraft(
    composing,
    "新しい",
    new ActionReceipt(101),
    true,
  );
  expect(synchronizeDraft(committed, "新しい", 101).pending).toBe(0);
  expect(editDraft(initial, "local", undefined, true).pending).toBe(0);
  expect(synchronizeDraft(initial, "external", 1).value).toBe("external");
});
