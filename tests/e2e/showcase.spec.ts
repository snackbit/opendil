import { expect, test } from "@playwright/test";
import { dilPage, openShowcase, scrollPreview } from "./site-demo-page";

/*
 * Showcase and interaction regressions from showcase.spec.ts and interactions.spec.ts, run against
 * the Next.js playground. Specs use relative URLs so they follow SITE_BASE_PATH.
 */

test("renders the source and wires the showcase controls", async ({
  page,
  context,
}) => {
  const ui = dilPage(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openShowcase(page);
  await expect(ui.locator('[data-complete="true"]')).toBeAttached();
  await expect(
    ui.getByRole("heading", {
      name: "Interactive workspace",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    ui.getByRole("heading", { name: "Actions and code" }),
  ).toBeAttached();
  await expect(ui.locator('.dil-document [role="alert"]')).toHaveCount(0);
  for (const name of ["Billing", "Time range"]) {
    const corners = await ui
      .getByRole("radiogroup", { name, exact: true })
      .getByRole("radio")
      .evaluateAll((elements) =>
        elements.flatMap((element) => {
          const style = getComputedStyle(element);
          return [
            style.borderTopLeftRadius,
            style.borderTopRightRadius,
            style.borderBottomLeftRadius,
            style.borderBottomRightRadius,
          ].map(Number.parseFloat);
        }),
      );
    expect(corners.every((radius) => radius > 0)).toBe(true);
  }
  await ui.getByRole("radio", { name: "3M", exact: true }).click();
  await expect(ui.locator('[data-chart-type="line"]')).toHaveAttribute(
    "data-points",
    "3",
  );
  await ui.getByRole("radio", { name: "Users", exact: true }).click();
  await expect(
    ui.getByRole("checkbox", { name: "Show revenue target" }),
  ).toBeDisabled();
  await ui.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(ui.locator('[data-chart-type="line"]')).toHaveAttribute(
    "data-points",
    "6",
  );
  const breakdown = ui.getByRole("checkbox", {
    name: "Show monthly breakdown",
    exact: true,
  });
  await breakdown.check();
  await expect(
    ui.getByRole("cell", { name: "May", exact: true }),
  ).toBeVisible();
  await breakdown.uncheck();
  await expect(ui.getByRole("cell", { name: "May", exact: true })).toHaveCount(
    0,
  );
  await expect(
    ui.getByRole("checkbox", { name: "Show revenue target" }),
  ).toBeEnabled();
  await expect(ui.getByText("€213.60", { exact: true })).toBeVisible();
  await ui.getByRole("radio", { name: "Monthly", exact: true }).click();
  await expect(ui.getByText("€267.00", { exact: true })).toBeVisible();
  await ui.getByRole("checkbox", { name: /Advanced analytics/ }).uncheck();
  await expect(
    ui.getByRole("heading", { name: "€232.00", exact: true }),
  ).toBeVisible();
  const copy = ui.getByRole("button", { name: "Copy configuration" });
  await copy.click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("Monthly: €232.00");
  await expect(ui.locator(".dil-tooltip")).toContainText("Copied");
  await expect(copy).toBeFocused();
  await expect(ui.locator(".dil-tooltip")).toHaveCount(0, { timeout: 4000 });
  await ui.getByRole("textbox", { name: "Display name" }).fill("Felix");
  await expect(
    ui.getByRole("heading", { name: "Welcome back, Felix" }),
  ).toBeVisible();
  await ui.getByRole("button", { name: "Test interaction" }).click();
  await expect(ui.getByText("Action triggered for Felix.")).toBeVisible();
  await ui.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(ui.getByText("Action triggered for Felix.")).toHaveCount(0);
  await ui.getByRole("radio", { name: "Emerald", exact: true }).click();
  await ui.getByRole("slider", { name: "Corner radius" }).focus();
  await page.keyboard.press("Home");
  await expect(ui.getByText("Radius: 4px · comfortable layout")).toBeVisible();
  await ui.getByRole("button", { name: "Database", exact: true }).click();
  await expect(
    ui.getByRole("heading", { name: "1024 MB", exact: true }),
  ).toBeVisible();
  await ui
    .getByRole("checkbox", {
      name: "Analytics integration complete",
      exact: true,
    })
    .check();
  await ui
    .getByRole("checkbox", { name: "Production rollout", exact: true })
    .check();
  await expect(
    ui.getByText("All launch requirements complete", { exact: true }),
  ).toBeVisible();
  await ui
    .getByRole("button", { name: "Reset checklist", exact: true })
    .click();
  await expect(
    ui.getByText("0 of 4 tasks completed", { exact: true }),
  ).toBeVisible();
  const firstImage = ui.getByRole("img", {
    name: /^architectural photography/,
  });
  await firstImage.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      firstImage.evaluate((image) =>
        image instanceof HTMLImageElement ? image.naturalWidth : 0,
      ),
    )
    .toBeGreaterThan(0);
  await ui.getByRole("button", { name: "Next slide", exact: true }).click();
  const secondImage = ui.getByRole("img", { name: /^macro photography/ });
  await expect
    .poll(() =>
      secondImage.evaluate((image) =>
        image instanceof HTMLImageElement ? image.naturalWidth : 0,
      ),
    )
    .toBeGreaterThan(0);
  await ui
    .getByRole("checkbox", { name: "Show operational metrics", exact: true })
    .uncheck();
  await expect(ui.getByRole("heading", { name: "99.99%" })).toHaveCount(0);
  await ui
    .getByRole("checkbox", { name: "Show operational metrics", exact: true })
    .check();
  await expect(ui.getByRole("heading", { name: "99.99%" })).toBeVisible();
  await expect(
    ui.getByRole("heading", { name: "Workspace preferences", exact: true }),
  ).toBeVisible();
  await ui
    .getByRole("checkbox", { name: "Show activity details", exact: true })
    .uncheck();
  await expect(
    ui.getByText("feature/dashboard-ui → main", { exact: true }),
  ).toHaveCount(0);
  await ui
    .getByRole("checkbox", { name: "Show activity details", exact: true })
    .check();
  await ui.getByRole("button", { name: "Show popover" }).click();
  await expect(
    ui.getByText("Contextual popover", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(ui.getByText("Contextual popover", { exact: true })).toHaveCount(
    0,
  );
  await ui
    .getByRole("textbox", { name: "Code editor", exact: true })
    .fill("const edited = true;");
  await expect(
    ui.getByRole("textbox", { name: "Code editor", exact: true }),
  ).toHaveValue("const edited = true;");
  await ui
    .getByRole("button", { name: "Copy all settings", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('"displayName": "Felix"');
  expect(errors).toEqual([]);
});

test("reports a failed copy where the Clipboard API is unavailable", async ({
  page,
}) => {
  // Insecure contexts, such as a plain-HTTP LAN host, have no navigator.clipboard.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "clipboard", {
      get: () => undefined,
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // The playground showcase in iframe mode.
  await openShowcase(page);
  const ui = dilPage(page);
  await ui.getByRole("button", { name: "Copy configuration" }).click();
  await expect(ui.locator(".dil-tooltip")).toContainText("Copy failed");
  // The landing preview in its default shadow mode.
  await page.goto("./");
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  const hero = page.locator(".od-hero-output");
  await hero.getByRole("button", { name: "Copy configuration" }).click();
  await expect(hero.locator(".dil-tooltip")).toContainText("Copy failed");
  expect(errors).toEqual([]);
});
test("renders the showcase on mobile and handles an image failure locally", async ({
  page,
}) => {
  const ui = dilPage(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openShowcase(page);
  await expect(ui.locator('[data-complete="true"]')).toBeAttached();
  // Expression values still arrive after the text completes and more than double
  // the document's height. The content-sized frame cannot anchor the host's
  // scroll position, so let them settle before scrolling to the image.
  await expect(
    ui.locator('[data-dil-pending], [aria-busy="true"]'),
  ).toHaveCount(0);
  // On narrow screens the preview pane extends below the window, so scroll the
  // lazily loaded image itself into view rather than its section heading.
  await ui.locator("img").first().scrollIntoViewIfNeeded();
  await page.frames()[1]?.evaluate(() => {
    const image = document.querySelector("img");
    if (image) image.src = "data:image/jpeg;base64,invalid";
  });
  await expect(
    ui.getByText("Image unavailable", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await ui.getByRole("button", { name: "Show popover", exact: true }).click();
  await expect(
    ui.getByText("Contextual popover", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("keeps controls usable as later declarations and content arrive", async ({
  page,
}) => {
  const ui = dilPage(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openShowcase(page, "?benchmark=1");
  await expect(ui.locator('[data-complete="true"]')).toBeAttached();
  await ui.getByRole("button", { name: "Replay" }).click();
  await expect(ui.locator('[data-complete="false"]')).toBeAttached();
  await expect(
    ui.getByRole("slider", { name: "Annual growth assumption" }),
  ).toBeEnabled();
  await ui.getByRole("slider", { name: "Annual growth assumption" }).click();
  await ui.getByRole("slider", { name: "Annual growth assumption" }).focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(
    ui.getByRole("slider", { name: "Annual growth assumption" }),
  ).toHaveAttribute("aria-valuenow", "-18");
  await ui.getByRole("button", { name: "Pause", exact: true }).click();
  const before = await ui
    .locator("[data-scanned]")
    .getAttribute("data-scanned");
  await ui.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(ui.locator('[data-complete="true"]')).toBeAttached();
  await expect(
    ui.getByRole("slider", { name: "Annual growth assumption" }),
  ).toHaveAttribute("aria-valuenow", "-18");
  expect(Number(before)).toBeLessThan(25195);
  await expect(ui.locator('.dil-document [role="alert"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("typing paints native feedback promptly and derived text settles within budget", async ({
  page,
}, testInfo) => {
  const ui = dilPage(page);
  await openShowcase(page);
  // Measure steady-state typing: the document has finished streaming and revealing.
  await expect(ui.locator('[data-complete="true"]')).toBeAttached();
  const input = ui.getByRole("textbox", { name: "Display name" });
  await input.scrollIntoViewIfNeeded();
  await expect(ui.locator("[data-dil-revealing]")).toHaveCount(0);
  await input.fill("");
  await input.evaluate((element) => {
    if (!(element instanceof HTMLInputElement))
      throw new Error("Missing input");
    const metrics = { native: [] as number[], derived: [] as number[] };
    const pending = new Map<string, number>();
    element.addEventListener("input", () => {
      const start = performance.now();
      pending.set(element.value, start);
      requestAnimationFrame(() =>
        metrics.native.push(performance.now() - start),
      );
    });
    const observer = new MutationObserver(() => {
      const heading = [...document.querySelectorAll("h3")].find((item) =>
        item.textContent?.startsWith("Welcome back, "),
      );
      for (const [value, start] of pending) {
        if (heading?.textContent === "Welcome back, " + value) {
          metrics.derived.push(performance.now() - start);
          pending.delete(value);
        }
      }
    });
    observer.observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    Object.defineProperty(window, "dilTypingMetrics", { value: metrics });
  });
  // A fast typist's pace, so each keystroke gets its own derived update to time.
  // Faster input merges intermediate values and leaves too few samples for a p95.
  await input.pressSequentially("Fast native feedback", { delay: 60 });
  await expect(
    ui.getByRole("heading", {
      name: "Welcome back, Fast native feedback",
      exact: true,
    }),
  ).toBeVisible();
  const samples = await input.evaluate(() => {
    const metrics: unknown = Reflect.get(window, "dilTypingMetrics");
    if (
      !metrics ||
      typeof metrics !== "object" ||
      !("native" in metrics) ||
      !Array.isArray(metrics.native) ||
      !("derived" in metrics) ||
      !Array.isArray(metrics.derived)
    )
      throw new Error("Missing typing samples");
    return {
      native: metrics.native.filter(
        (value): value is number => typeof value === "number",
      ),
      derived: metrics.derived.filter(
        (value): value is number => typeof value === "number",
      ),
    };
  });
  const p95 = (values: number[]) =>
    values.sort((a, b) => a - b)[Math.floor(values.length * 0.95)] ?? Infinity;
  const summary = {
    nativeP95Ms: p95(samples.native),
    derivedP95Ms: p95(samples.derived),
    nativeSamples: samples.native.length,
    derivedSamples: samples.derived.length,
  };
  console.log("Typing benchmark:", JSON.stringify(summary));
  await testInfo.attach("typing-performance", {
    body: JSON.stringify(summary),
    contentType: "application/json",
  });
  // Shared CI runners measured 57 ms for a budget that local hardware meets.
  const allowance = process.env.CI ? 1.5 : 1;
  expect(summary.derivedSamples).toBeGreaterThanOrEqual(10);
  expect(summary.nativeP95Ms).toBeLessThan(50 * allowance);
  expect(summary.derivedP95Ms).toBeLessThan(100 * allowance);
});

test("rapid input never rolls back and an immediate action reads the final value", async ({
  page,
}) => {
  // Retain the real parser and VM, but delay their replies to exercise stale acknowledgements.
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const descriptor = Object.getOwnPropertyDescriptor(
      NativeWorker.prototype,
      "onmessage",
    );
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        Object.defineProperty(this, "onmessage", {
          set: (handler: ((event: MessageEvent) => void) | null) => {
            descriptor?.set?.call(
              this,
              handler
                ? (event: MessageEvent) => setTimeout(() => handler(event), 30)
                : null,
            );
          },
        });
      }
    };
  });
  const ui = dilPage(page);
  await openShowcase(page);
  const input = ui.getByRole("textbox", { name: "Display name" });
  await input.fill("");
  const name = "Quickly typing without losing any characters";
  await input.pressSequentially(name, { delay: 1 });
  await expect(input).toHaveValue(name);
  await ui.getByRole("button", { name: "Test interaction" }).click();
  await expect(
    ui.getByText("Action triggered for " + name + ".", { exact: true }),
  ).toBeVisible();
  await expect(input).toHaveValue(name);
});

test("chart hover preserves donut proportions and legends select multiple series", async ({
  page,
}, testInfo) => {
  const ui = dilPage(page);
  await openShowcase(page);
  const pie = ui.locator('[data-chart-type="pie"]');
  const legend = pie.getByRole("group", { name: "Chart legend", exact: true });
  const organic = legend.getByText("Organic", { exact: true });
  const direct = legend.getByText("Direct", { exact: true });
  await expect(pie.locator(".recharts-sector")).toHaveCount(4);
  const sector = pie.locator(".recharts-sector").first();
  const point = await sector.evaluate((element) => {
    if (!(element instanceof SVGPathElement))
      throw new Error("Missing pie sector");
    // The bounding-box center lies in the doughnut hole; use a point inside the arc.
    const arc = element.getPointAtLength(element.getTotalLength() * 0.2);
    const cx = Number(element.getAttribute("cx")),
      cy = Number(element.getAttribute("cy"));
    const matrix = element.getScreenCTM();
    if (!matrix) throw new Error("Missing chart transform");
    const point = new DOMPoint(
      cx + (arc.x - cx) * 0.8,
      cy + (arc.y - cy) * 0.8,
    ).matrixTransform(matrix);
    const box = element.getBoundingClientRect();
    return { x: point.x - box.left, y: point.y - box.top };
  });
  await sector.hover({ position: point });
  await expect(direct).toHaveAttribute("data-muted", "true");
  await expect(pie.locator(".recharts-sector").nth(1)).toHaveCSS(
    "opacity",
    "0.625",
  );
  await testInfo.attach("chart-hover", {
    body: await pie.screenshot(),
    contentType: "image/png",
  });
  await organic.hover();
  await expect(direct).toHaveAttribute("data-muted", "true");
  await organic.click();
  await expect(pie.locator(".recharts-sector")).toHaveCount(4);
  await organic.focus();
  await page.keyboard.press("Enter");
  await expect(pie.locator(".recharts-sector")).toHaveCount(4);
  const line = ui.locator('[data-chart-type="line"]');
  await line.getByRole("button", { name: "Revenue (€k)", exact: true }).click();
  await expect(line.locator(".recharts-line-curve")).toHaveCount(1);
  await line.getByRole("button", { name: "Revenue (€k)", exact: true }).click();
  await expect(line.locator(".recharts-line-curve")).toHaveCount(2);
});

test("host inputs preserve edits, selections, composition, and external resets", async ({
  page,
}) => {
  await openShowcase(page);
  await page.getByRole("radio", { name: "Customization", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Host display name" });
  await input.click();
  await input.fill("");
  await input.pressSequentially("abcdef", { delay: 1 });
  await input.press("ArrowLeft");
  await input.press("Backspace");
  await expect(input).toHaveValue("abcdf");
  await input.press("Home");
  await input.pressSequentially("X", { delay: 1 });
  await expect(input).toHaveValue("Xabcdf");
  await input.dispatchEvent("compositionstart");
  await input.pressSequentially("yz", { delay: 1 });
  await expect(input).toHaveValue("Xyzabcdf");
  await input.dispatchEvent("compositionend");
  await expect(
    page.getByText("Host name: Xyzabcdf", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset host name" }).click();
  await expect(input).toHaveValue("Alex");
});

test("graph subtitles survive adaptation and connectors have room between nodes", async ({
  page,
}, testInfo) => {
  const ui = dilPage(page);
  await openShowcase(page);
  const graph = ui.getByLabel("Interactive node graph");
  for (const sub of [
    "Ingress",
    "Compute",
    "Async jobs",
    "Storage",
    "Messaging",
  ])
    await expect(graph.getByText(sub, { exact: true })).toBeVisible();
  const source = await graph
    .locator('.react-flow__node[data-id="0"]')
    .boundingBox();
  const target = await graph
    .locator('.react-flow__node[data-id="1"]')
    .boundingBox();
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();
  expect(
    (target?.x ?? 0) - (source?.x ?? 0) - (source?.width ?? 0),
  ).toBeGreaterThan(20);
  await graph.getByText("Database", { exact: true }).click();
  await expect(
    ui.getByRole("heading", { name: "1024 MB", exact: true }),
  ).toBeVisible();
  await testInfo.attach("graph", {
    body: await graph.screenshot(),
    contentType: "image/png",
  });
});

test("progressive reveal preserves action feedback and respects reduced motion", async ({
  page,
}) => {
  const ui = dilPage(page);
  await openShowcase(page);
  await expect(ui.locator('[data-complete="true"]')).toBeAttached();
  await expect(ui.locator("[data-dil-revealing]")).toHaveCount(0);
  await page.getByRole("button", { name: "Demo settings" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Progressive reveal" }),
  ).toBeChecked();
  await page.keyboard.press("Escape");
  await ui.getByRole("button", { name: "Primary", exact: true }).click();
  await expect
    .poll(() => ui.locator("[data-dil-revealing]").count())
    .toBeGreaterThan(0);
  await expect(
    ui.getByText("Primary action selected", { exact: true }),
  ).toBeVisible();
  await expect(ui.locator("[data-dil-revealing]")).toHaveCount(0);
  await expect(
    ui.getByRole("button", { name: "Primary", exact: true }),
  ).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ui
    .getByRole("checkbox", {
      name: "Analytics integration complete",
      exact: true,
    })
    .check();
  await ui
    .getByRole("checkbox", { name: "Production rollout", exact: true })
    .check();
  await expect(
    ui.getByText("All launch requirements complete", { exact: true }),
  ).toBeVisible();
  await expect(ui.locator("[data-dil-revealing]")).toHaveCount(0);
});

test("virtualized content keeps edits and does not replay its reveal when returning", async ({
  page,
}) => {
  const ui = dilPage(page);
  await openShowcase(page);
  await page
    .getByRole("radio", { name: "Large document", exact: true })
    .click();
  const note = ui.getByRole("textbox", {
    name: "A note that survives scrolling",
  });
  // A real click waits for reveal's native inert period; fill alone bypasses that hit testing.
  await note.click();
  await note.fill("Preserved with reveal");
  await expect(note).toHaveValue("Preserved with reveal");
  await expect(ui.locator("[data-dil-revealing]")).toHaveCount(0);
  await page.getByRole("button", { name: "Replay" }).focus();
  await scrollPreview(page, 100000);
  await expect(note).not.toBeAttached();
  await expect(ui.locator("[data-dil-revealing]")).toHaveCount(0);
  await scrollPreview(page, 0);
  await expect(note).toHaveValue("Preserved with reveal");
  await expect(ui.locator("[data-dil-revealing]")).toHaveCount(0);
});
