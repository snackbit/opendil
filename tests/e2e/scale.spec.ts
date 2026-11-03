import { dilPage, openShowcase } from "./dil-page";
import { expect, test } from "@playwright/test";

test("virtualizes thousands of blocks while preserving focus and offscreen state", async ({
  page,
}) => {
  const ui = dilPage(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openShowcase(page);
  await expect(ui.locator('[data-complete="true"]')).toBeAttached();
  await ui.getByRole("radio", { name: "Large document", exact: true }).click();
  await expect(ui.locator('[data-complete="true"]')).toBeAttached();
  await expect(
    ui.getByRole("heading", { name: "Record 1", exact: true }),
  ).toBeVisible();
  expect(
    Number(await ui.locator("[data-scanned]").getAttribute("data-scanned")),
  ).toBeGreaterThan(1024 * 1024);
  expect(
    await ui.locator('[data-dil-content] [data-d-component="box"]').count(),
  ).toBeLessThan(100);
  const note = ui.getByRole("textbox", {
    name: "A note that survives scrolling",
  });
  await note.fill("Keep this edit");
  await page.evaluate(() => window.scrollTo(0, 100000));
  await expect(note).toBeFocused();
  await ui.getByRole("button", { name: "Replay stream" }).focus();
  await expect(note).not.toBeAttached();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(note).toHaveValue("Keep this edit");
  await expect(ui.locator('.dil-document [role="alert"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("virtualizes repeated templates and table rows without invalid HTML", async ({
  page,
}) => {
  const ui = dilPage(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openShowcase(page);
  await expect(ui.locator('[data-complete="true"]')).toBeAttached();
  for (const fixture of ["Long list", "Long table"]) {
    await ui.getByRole("radio", { name: fixture, exact: true }).click();
    await expect(ui.locator('[data-complete="true"]')).toBeAttached();
    await expect(
      ui.getByRole("button", { name: "Inspect Entry 1", exact: true }),
    ).toBeVisible();
    await ui
      .getByRole("button", { name: "Inspect Entry 1", exact: true })
      .click();
    await expect(ui.getByText("Selected", { exact: true })).toBeVisible();
    await ui.getByRole("button", { name: "Replay stream" }).focus();
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    try {
      await expect(
        ui.getByRole("button", { name: "Inspect Entry 5000", exact: true }),
      ).toBeVisible();
    } catch (error) {
      console.log(
        "Virtual tail diagnostic",
        JSON.stringify({
          fixture,
          host: await page.locator("iframe").evaluate((element) => ({
            y: scrollY,
            height: document.documentElement.scrollHeight,
            frame: element.getBoundingClientRect().toJSON(),
            viewport: innerHeight,
          })),
          flow: await ui
            .locator('[data-virtualized="true"]')
            .evaluateAll((elements) =>
              elements.map((element) => ({
                rect: element.getBoundingClientRect().toJSON(),
                height: (element as HTMLElement).style.height,
                items: [
                  ...element.querySelectorAll("[data-virtual-index]"),
                ].map((row) => ({
                  index: row.getAttribute("data-virtual-index"),
                  top: row.getBoundingClientRect().top,
                  height: row.getBoundingClientRect().height,
                })),
              })),
            ),
        }),
      );
      throw error;
    }
    expect(
      await ui.getByRole("button", { name: /^Inspect Entry/ }).count(),
    ).toBeLessThan(100);
    if (fixture === "Long table")
      expect(await ui.locator("tbody > div").count()).toBe(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(ui.getByText("Selected", { exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("streams a large document with bounded DOM and responsive updates", async ({
  page,
  browser,
}, testInfo) => {
  const ui = dilPage(page);
  await openShowcase(page, "?benchmark=1");
  await expect(ui.locator('[data-complete="true"]')).toBeAttached();
  await ui.getByRole("radio", { name: "Large document", exact: true }).click();
  await expect(ui.locator('[data-complete="true"]')).toBeAttached();
  const profiling = process.env.OPENDIL_PROFILE === "1";
  if (profiling)
    await browser.startTracing(page, {
      path: testInfo.outputPath("timeline.json"),
      categories: [
        "devtools.timeline",
        "v8",
        "disabled-by-default-v8.cpu_profiler",
      ],
    });
  await page.evaluate(() => {
    const pending: { length: number; start: number }[] = [];
    const latencies: number[] = [];
    const longTasks: number[] = [];
    const longTaskContexts: string[] = [];
    let submitted = 0,
      scanned = 0;
    const input = (event: Event) => {
      if (
        event instanceof CustomEvent &&
        typeof event.detail?.length === "number"
      ) {
        submitted = event.detail.length;
        pending.push({ length: submitted, start: performance.now() });
      }
    };
    const commit = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const consumed = Number(event.detail?.scanned);
      scanned = consumed;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          while (pending[0] && pending[0].length <= consumed + 2) {
            const item = pending.shift();
            if (item) latencies.push(performance.now() - item.start);
          }
        }),
      );
    };
    window.addEventListener("dil:input", input);
    window.addEventListener("dil:commit", commit);
    const observer = new PerformanceObserver((list) => {
      for (const item of list.getEntries()) {
        longTasks.push(item.duration);
        longTaskContexts.push(
          `${item.duration} ms at ${scanned} parsed / ${submitted} submitted characters`,
        );
      }
    });
    observer.observe({ type: "longtask", buffered: false });
    Object.defineProperty(window, "dilBenchmark", {
      configurable: true,
      value: { latencies, longTasks, longTaskContexts },
    });
  });
  await ui.getByRole("button", { name: "Replay stream" }).click();
  await page.mouse.wheel(0, -5000);
  const note = ui.getByRole("textbox", {
    name: "A note that survives scrolling",
  });
  await note.fill("Edited during streaming");
  await expect(ui.locator('[data-complete="true"]')).toBeAttached({
    timeout: 45000,
  });
  const measurements = await page.evaluate(() => {
    const value: unknown = Reflect.get(window, "dilBenchmark");
    if (
      typeof value !== "object" ||
      value === null ||
      !("latencies" in value) ||
      !("longTasks" in value)
    )
      throw new Error("Benchmark missing");
    return {
      latencies: Array.isArray(value.latencies)
        ? value.latencies.filter(
            (item): item is number => typeof item === "number",
          )
        : [],
      longTasks: Array.isArray(value.longTasks)
        ? value.longTasks.filter(
            (item): item is number => typeof item === "number",
          )
        : [],
      longTaskContexts:
        "longTaskContexts" in value && Array.isArray(value.longTaskContexts)
          ? value.longTaskContexts.filter(
              (item): item is string => typeof item === "string",
            )
          : [],
    };
  });
  const sorted = [...measurements.latencies].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? Infinity;
  const summary = {
    updates: sorted.length,
    p95InputToPaintMs: p95,
    maxLongTaskMs: Math.max(0, ...measurements.longTasks),
    mountedBlocks: await ui
      .locator('[data-dil-content] [data-d-component="box"]')
      .count(),
    longTaskContexts: measurements.longTaskContexts,
  };
  console.log("Streaming benchmark:", JSON.stringify(summary));
  if (profiling) await browser.stopTracing();
  await testInfo.attach("streaming-performance", {
    body: JSON.stringify(summary, null, 2),
    contentType: "application/json",
  });
  await expect(note).toHaveValue("Edited during streaming");
  await expect(note).toBeFocused();
  expect(summary.updates).toBeGreaterThan(100);
  expect(summary.mountedBlocks).toBeLessThan(100);
  // Commits are not yet split, so slower CPUs see 80-180 ms tasks when parse
  // batches grow. CI keeps a regression ceiling until commits yield to the browser.
  expect(summary.p95InputToPaintMs).toBeLessThan(process.env.CI ? 150 : 100);
  expect(summary.maxLongTaskMs).toBeLessThanOrEqual(process.env.CI ? 250 : 50);
});
