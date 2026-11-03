import { expect, it } from "vitest";
import {
  reconcileChartSelection,
  selectChartItem,
} from "../../../packages/opendil/src/dil/widgets/charts/chart-selection";
it("isolates on plain click and restores all on the isolated item", () => {
  const ids = ["a", "b", "c"];
  const hidden = selectChartItem(ids, new Set(), "b", false);
  expect([...hidden]).toEqual(["a", "c"]);
  expect([...selectChartItem(ids, hidden, "b", false)]).toEqual([]);
  expect([...selectChartItem(ids, hidden, "c", false)]).toEqual(["a", "b"]);
});
it("toggles individual items, allows none visible, and recovers", () => {
  const ids = ["a", "b"];
  const a = selectChartItem(ids, new Set(), "a", true);
  const none = selectChartItem(ids, a, "b", true);
  expect([...none]).toEqual(ids);
  expect([...selectChartItem(ids, none, "a", true)]).toEqual(["b"]);
  expect([...selectChartItem(ids, none, "b", false)]).toEqual(["a"]);
  expect([...selectChartItem(["a"], new Set(), "a", false)]).toEqual([]);
});
it("drops removed identities and starts new series visible", () => {
  expect([...reconcileChartSelection(["b", "c"], new Set(["a", "b"]))]).toEqual(
    ["b"],
  );
  expect([
    ...selectChartItem(["b"], new Set(["a", "b"]), "missing", false),
  ]).toEqual(["b"]);
});
