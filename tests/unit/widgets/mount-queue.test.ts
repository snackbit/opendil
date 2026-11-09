// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMountTurn } from "../../../packages/opendil/src/dil/widgets/mount-queue";

let mount: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mount = document.createElement("div");
  document.body.append(mount);
  root = createRoot(mount);
});
afterEach(async () => {
  await act(() => root.unmount());
  mount.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function Widget({ name, immediate }: { name: string; immediate: boolean }) {
  const ready = useMountTurn(immediate);
  return createElement("p", { "data-ready": ready }, name);
}
const ready = () =>
  [...mount.querySelectorAll('[data-ready="true"]')].map((p) => p.textContent);
const show = (names: string[], immediate = false) =>
  act(() =>
    root.render(
      names.map((name) =>
        createElement(Widget, { key: name, name, immediate }),
      ),
    ),
  );
const nextTask = () => act(() => vi.advanceTimersToNextTimer());

it("mounts waiting widgets one per task, each after the previous committed", async () => {
  await show(["a", "b", "c"]);
  expect(ready()).toEqual([]);
  await nextTask();
  expect(ready()).toEqual(["a"]);
  await nextTask();
  expect(ready()).toEqual(["a", "b"]);
  await nextTask();
  expect(ready()).toEqual(["a", "b", "c"]);
});

it("mounts immediate widgets at once and skips widgets that unmount while waiting", async () => {
  await show(["first"], true);
  expect(ready()).toEqual(["first"]);
  await show(["a", "b", "c"]);
  await show(["a", "c"]);
  await nextTask();
  await nextTask();
  expect(ready()).toEqual(["a", "c"]);
});
