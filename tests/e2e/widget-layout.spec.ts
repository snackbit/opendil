import { expect, test, type Locator, type Page } from "@playwright/test";
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

async function bounds(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Expected visible layout content");
  return box;
}

function baseline(locator: Locator) {
  return locator.evaluate((element) => {
    const label = document.createElement("span");
    const marker = document.createElement("i");
    marker.style.cssText = "display:inline-block;width:0;height:0";
    label.append(...element.childNodes, marker);
    element.append(label);
    const position = marker.getBoundingClientRect().top;
    marker.remove();
    label.replaceWith(...label.childNodes);
    return position;
  });
}

test("rows align their contents and metric cards have readable spacing", async ({
  page,
}) => {
  const output = await hostWorkbench(page);
  const editor = page.getByRole("textbox", { name: "DIL source", exact: true });
  await replaceSource(
    page,
    editor,
    [
      '<row gap={3} wrap="wrap">',
      '<title size="xl">Workflow runs</title>',
      '<badge color="secondary">Interactive demo · sample data</badge>',
      "</row>",
      "",
      '<box padding={4} border radius="lg">',
      "<caption>Latest run</caption>",
      '<text size="2xl">42s</text>',
      '<badge color="success">Recovered after retry</badge>',
      "</box>",
      "",
      '<box padding={3} border radius="md"><row gap={3} wrap="wrap">',
      '<button variant="outline">run-1040</button>',
      "<text>Release production</text>",
      '<badge color="danger">Failed</badge>',
      "<spacer/>",
      "<text tabularNums>18s</text>",
      "<caption>release/v2 · d72ae90</caption>",
      "</row></box>",
      "",
      '<row align="stretch"><title>Authored alignment</title><badge>Stretch</badge></row>',
      "<box gap={0}><caption>Authored gap</caption><text>Zero</text></box>",
    ].join("\n"),
  );
  const heading = output.getByRole("heading", { name: "Workflow runs" });
  const label = (component: "caption" | "text" | "badge", name: string) =>
    output
      .locator(
        component === "badge"
          ? '[data-slot="badge"]'
          : `[data-d-component="${component}"]`,
      )
      .filter({ hasText: name });
  const badge = label("badge", "Interactive demo · sample data");
  await expect(heading).toBeVisible();
  await expect(badge).toBeVisible();
  expect((await bounds(badge)).height).toBeLessThan(
    (await bounds(heading)).height,
  );
  expect(
    Math.abs((await baseline(heading)) - (await baseline(badge))),
  ).toBeLessThanOrEqual(1);

  const caption = await bounds(label("caption", "Latest run"));
  const metric = await bounds(label("text", "42s"));
  const status = await bounds(label("badge", "Recovered after retry"));
  expect(metric.height).toBeGreaterThanOrEqual(36);
  expect(metric.y - caption.y - caption.height).toBeCloseTo(4, 0);
  expect(status.y - metric.y - metric.height).toBeCloseTo(4, 0);

  const button = await bounds(output.getByRole("button", { name: "run-1040" }));
  for (const [component, name] of [
    ["text", "Release production"],
    ["badge", "Failed"],
    ["text", "18s"],
    ["caption", "release/v2 · d72ae90"],
  ] as const) {
    const item = await bounds(label(component, name));
    const centerOffset =
      item.y + item.height / 2 - (button.y + button.height / 2);
    expect(Math.abs(centerOffset), name).toBeLessThanOrEqual(1);
  }

  const authored = await bounds(
    output.getByRole("heading", { name: "Authored alignment" }),
  );
  expect((await bounds(label("badge", "Stretch"))).height).toBeCloseTo(
    authored.height,
    0,
  );
  const zeroCaption = await bounds(label("caption", "Authored gap"));
  expect(
    (await bounds(label("text", "Zero"))).y -
      zeroCaption.y -
      zeroCaption.height,
  ).toBeCloseTo(0, 0);

  await page.setViewportSize({ width: 360, height: 900 });
  await expect
    .poll(async () => {
      const title = await bounds(heading);
      return (await bounds(badge)).y - title.y - title.height;
    })
    .toBeGreaterThanOrEqual(0);
  const row = heading.locator("..");
  expect(
    await row.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBe(0);
});

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
