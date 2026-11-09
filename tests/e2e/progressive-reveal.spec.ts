import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  closeSettings,
  previewPane,
  replaceSource,
  scrollPreview,
} from "./site-demo-page";

/*
 * progressive-reveal.spec.ts: progressive reveal in Host DOM mode, where the
 * renderer finds the workbench preview pane as its external scroll container.
 * Reveal stays on (the workbench default) in every test here.
 */

const GRAPH =
  '<NodeGraph content={{"nodes": [{"id": "a", "label": "API"}, {"id": "b", "label": "Database"}], "edges": [{"source": "a", "target": "b"}]}}/>';

interface RevealStats {
  /** Reveal targets that were ever hidden, which proves the reveal ran. */
  hidden: number;
  /** The longest time, in ms, one element stayed hidden. */
  longest: number;
}

/** Records, every frame, how long each reveal target stays hidden. */
async function trackReveal(page: Page) {
  await page.addInitScript(() => {
    const since = new Map<Element, number>();
    const seen = new WeakSet<Element>();
    const stats = { hidden: 0, longest: 0 };
    const sample = () => {
      const now = performance.now();
      for (const element of document.querySelectorAll<HTMLElement>(
        "[data-dil-presentation]",
      )) {
        if (!element.inert && element.style.opacity !== "0") {
          since.delete(element);
          continue;
        }
        if (!seen.has(element)) {
          seen.add(element);
          stats.hidden++;
        }
        const start = since.get(element) ?? now;
        since.set(element, start);
        stats.longest = Math.max(stats.longest, now - start);
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    Reflect.set(window, "revealStats", () => ({ ...stats }));
  });
}
function revealStats(page: Page) {
  return page.evaluate(() =>
    (Reflect.get(window, "revealStats") as () => RevealStats)(),
  );
}
async function hostWorkbench(page: Page, source: string) {
  await trackReveal(page);
  await page.goto("demo/deployment/");
  await page
    .getByRole("button", { name: "Demo settings", exact: true })
    .click();
  await page.getByRole("radio", { name: "Host DOM", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Progressive reveal" }),
  ).toBeChecked();
  await closeSettings(page);
  const output = page.locator('.od-hero-output [data-dil-mode="host"]').first();
  await expect(output).toBeAttached();
  const editor = page.getByRole("textbox", { name: "DIL source", exact: true });
  await replaceSource(page, editor, source);
  // The edit applies after the editor's debounce; Replay then streams it.
  await expect(output.getByText("Paragraph 1.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  return output;
}
/** Reveal targets in the preview pane's visible area that are still hidden. */
function hiddenInView(page: Page) {
  return previewPane(page).evaluate((pane) => {
    const view = pane.getBoundingClientRect();
    return [
      ...pane.querySelectorAll<HTMLElement>("[data-dil-presentation]"),
    ].filter((element) => {
      const box = element.getBoundingClientRect();
      return (
        box.bottom > view.top &&
        box.top < view.bottom &&
        (element.inert ||
          element.style.opacity === "0" ||
          element.dataset.dilPhase !== "visible")
      );
    }).length;
  });
}
/** Whether a click at the graph's centre lands on the graph, as a reader's would. */
function graphTakesPointer(graph: Locator) {
  return graph.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return element.contains(
      document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      ),
    );
  });
}

test("an interrupted stream ends with every block visible and interactive", async ({
  page,
}) => {
  const output = await hostWorkbench(
    page,
    [
      "# Graph",
      ...Array.from({ length: 6 }, (_, index) => `Paragraph ${index + 1}.`),
      GRAPH,
      ...Array.from({ length: 40 }, (_, index) => `Line ${index + 1}.`),
      "<box>",
      "First finding",
    ].join("\n\n"),
  );
  // The finished answer shown before Replay already holds every line; wait
  // until the replayed stream reveals a block.
  await expect
    .poll(async () => (await revealStats(page)).hidden)
    .toBeGreaterThan(0);
  await expect(output.getByText("Line 5.", { exact: true })).toBeAttached();
  // The source never closes <box>, so finishing now ends an unfinished answer.
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(
    output.getByText("This response ended before it was finished."),
  ).toBeVisible();
  await expect
    .poll(() =>
      output
        .locator(
          '[data-dil-presentation]:is([inert], [data-dil-phase="ready"], [data-dil-phase="revealing"])',
        )
        .count(),
    )
    .toBe(0);
  await expect(
    output.getByText("First finding", { exact: true }),
  ).toBeVisible();
  const graph = output.getByLabel("Interactive node graph");
  await graph.scrollIntoViewIfNeeded();
  await expect(graph.getByText("Database", { exact: true })).toBeVisible();
  await expect.poll(() => graphTakesPointer(graph)).toBe(true);
  expect((await revealStats(page)).hidden).toBeGreaterThan(0);
});

test("virtualized blocks reveal while the reader scrolls a streaming answer, and the graph is never left blank", async ({
  page,
}) => {
  const output = await hostWorkbench(
    page,
    [
      "# Graph",
      ...Array.from({ length: 6 }, (_, index) => `Paragraph ${index + 1}.`),
      GRAPH,
      ...Array.from({ length: 300 }, (_, index) => `Line ${index + 1}.`),
    ].join("\n\n"),
  );
  // Following the stream scrolled the graph out of view, and the long flow
  // virtualizes it away.
  await expect(output.getByText("Line 80.", { exact: true })).toBeAttached();
  const pane = previewPane(page);
  const graph = output.getByLabel("Interactive node graph");
  const box = await pane.boundingBox();
  if (!box) throw new Error("Missing preview pane");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // The reader wheels back up while the answer is still streaming.
  for (let step = 0; step < 60; step++) {
    await page.mouse.wheel(0, -600);
    if ((await pane.evaluate((element) => element.scrollTop)) === 0) break;
  }
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(graph.getByText("Database", { exact: true })).toBeVisible();
  await expect.poll(() => graphTakesPointer(graph)).toBe(true);
  await expect.poll(() => hiddenInView(page)).toBe(0);

  await page.getByRole("button", { name: "Finish", exact: true }).click();
  // Every screen of the finished answer shows its blocks, whether they
  // revealed while streaming or mount for the first time now.
  // Virtual rows measure as they mount, so the scroll height grows on the way.
  const scrolled = () =>
    pane.evaluate((element) => ({
      top: element.scrollTop,
      step: element.clientHeight * 0.8,
      end: element.scrollTop + element.clientHeight >= element.scrollHeight - 1,
    }));
  for (let position = await scrolled(); !position.end;) {
    await scrollPreview(page, position.top + position.step);
    await expect.poll(() => hiddenInView(page)).toBe(0);
    position = await scrolled();
  }
  await expect(output.getByText("Line 300.", { exact: true })).toBeVisible();
  const stats = await revealStats(page);
  expect(stats.hidden).toBeGreaterThan(0);
  // The reveal is a stagger of at most six steps plus one fade: 480 ms by
  // default. The bound leaves room for a loaded CI machine.
  expect(stats.longest).toBeLessThan(2000);
});
