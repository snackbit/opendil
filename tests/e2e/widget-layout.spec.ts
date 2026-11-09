import { expect, test, type Page } from "@playwright/test";
import { closeSettings, replaceSource } from "./site-demo-page";

/* widget-layout.spec.ts, run against the Next.js playground with URLs relative to SITE_BASE_PATH. */

async function hostWorkbench(page: Page) {
  await page.goto("demo/deployment/");
  await page
    .getByRole("button", { name: "Demo settings", exact: true })
    .click();
  await page.getByRole("radio", { name: "Host DOM", exact: true }).click();
  // Reveal animations would hide widgets the tests point at.
  await page.getByRole("checkbox", { name: "Progressive reveal" }).uncheck();
  await closeSettings(page);
  const output = page.locator('.od-hero-output [data-dil-mode="host"]').first();
  await expect(output).toBeAttached();
  return output;
}
// Values that come from expressions wait for QuickJS, so each widget is
// pending at its first commit.
const PENDING_WIDGETS = [
  '{@body const graph = {nodes: [{id: "a", label: "API"}, {id: "b", label: "Database"}], edges: [{source: "a", target: "b"}]}}',
  '{@body const rows = [{m: "Jan", v: 3}, {m: "Feb", v: 5}]}',
  '{@body const diagram = "flowchart LR\\n  Build --> Ship"}',
  "Before the widgets.",
  "<NodeGraph content={graph}/>",
  '<Chart content={{chartType: "bar", data: rows, xKey: "m", series: [{dataKey: "v", label: "Visits"}]}}/>',
  "<Mermaid source={diagram}/>",
  "After the widgets.",
].join("\n\n");

test("pending NodeGraph and Chart hold their settled height, and Mermaid holds a minimum", async ({
  page,
}) => {
  // Records each pending placeholder's height when it is added.
  await page.addInitScript(() => {
    const heights: Record<string, number[]> = {};
    Reflect.set(window, "pendingHeights", heights);
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes)
          if (node instanceof HTMLElement) {
            const pending = [
              ...(node.matches("[data-dil-pending-name]") ? [node] : []),
              ...node.querySelectorAll<HTMLElement>("[data-dil-pending-name]"),
            ];
            for (const element of pending) {
              const name = element.dataset.dilPendingName ?? "";
              (heights[name] ??= []).push(element.offsetHeight);
            }
          }
    }).observe(document, { childList: true, subtree: true });
  });
  const output = await hostWorkbench(page);
  const editor = page.getByRole("textbox", { name: "DIL source", exact: true });
  await replaceSource(page, editor, PENDING_WIDGETS);
  const graph = output.getByLabel("Interactive node graph");
  const chart = output.locator('[data-chart-type="bar"]');
  const diagram = output.getByLabel("Mermaid diagram");
  await expect(graph.getByText("Database", { exact: true })).toBeVisible();
  await expect(chart).toBeVisible();
  await expect(diagram.locator("svg")).toBeVisible();
  await expect(output.locator("[data-dil-pending-name]")).toHaveCount(0);
  const pending = (await page.evaluate(() =>
    Reflect.get(window, "pendingHeights"),
  )) as Record<string, number[]>;
  const settled = async (locator: typeof graph) =>
    (await locator.boundingBox())?.height ?? 0;
  expect(pending.NodeGraph?.length).toBeGreaterThan(0);
  for (const height of pending.NodeGraph ?? [])
    expect(Math.abs(height - (await settled(graph)))).toBeLessThanOrEqual(1);
  expect(pending.Chart?.length).toBeGreaterThan(0);
  for (const height of pending.Chart ?? [])
    expect(Math.abs(height - (await settled(chart)))).toBeLessThanOrEqual(8);
  expect(pending.Mermaid?.length).toBeGreaterThan(0);
  for (const height of pending.Mermaid ?? []) expect(height).toBe(120);
});

test("the wheel scrolls past the node graph; focus or Ctrl+wheel zooms it", async ({
  page,
}) => {
  const output = await hostWorkbench(page);
  const editor = page.getByRole("textbox", { name: "DIL source", exact: true });
  await replaceSource(
    page,
    editor,
    [
      "# Graph",
      ...Array.from({ length: 12 }, (_, index) => `Paragraph ${index + 1}.`),
      '<NodeGraph content={{"nodes": [{"id": "a", "label": "API"}, {"id": "b", "label": "Database"}], "edges": [{"source": "a", "target": "b"}]}}/>',
      ...Array.from({ length: 40 }, (_, index) => `Line ${index + 1}.`),
    ].join("\n\n"),
  );
  const graph = output.getByLabel("Interactive node graph");
  await expect(graph.getByText("Database", { exact: true })).toBeVisible();
  const pane = page.getByLabel("Streaming preview", { exact: true });
  const zoom = () =>
    graph
      .locator(".react-flow__viewport")
      .evaluate((element) => (element as HTMLElement).style.transform);
  const scrolled = () =>
    pane.evaluate((element) => element.scrollTop + window.scrollY);
  // Smooth scrolling moves the graph after each wheel: wait until it stops,
  // then put the pointer on the graph, checked by hit testing.
  const pointAtGraph = async () => {
    for (const reveal of [false, true]) {
      if (reveal) await graph.scrollIntoViewIfNeeded();
      let previous = -1;
      await expect
        .poll(async () => {
          const current = await scrolled();
          const still = current === previous;
          previous = current;
          return still;
        })
        .toBe(true);
    }
    const box = await graph.boundingBox();
    if (!box) throw new Error("Missing graph");
    const point = [box.x + box.width / 2, box.y + 40] as const;
    expect(
      await graph.evaluate(
        (element, [x, y]) => element.contains(document.elementFromPoint(x, y)),
        point,
      ),
    ).toBe(true);
    await page.mouse.move(...point);
  };
  const before = await zoom();
  await pointAtGraph();
  const top = await scrolled();
  await page.mouse.wheel(0, 240);
  await expect.poll(scrolled).toBeGreaterThan(top);
  expect(await zoom()).toBe(before);
  await expect(graph).toHaveAttribute("data-wheel-zoom", "false");

  // Ctrl+wheel is a pinch: it zooms without focus.
  await pointAtGraph();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -200);
  await page.keyboard.up("Control");
  await expect.poll(zoom).not.toBe(before);

  // A focused graph zooms on a plain wheel and keeps the page in place.
  await graph.focus();
  await expect(graph).toHaveAttribute("data-wheel-zoom", "true");
  const focusedZoom = await zoom();
  const focusedTop = await scrolled();
  await page.mouse.wheel(0, 200);
  await expect.poll(zoom).not.toBe(focusedZoom);
  expect(await scrolled()).toBe(focusedTop);
});
