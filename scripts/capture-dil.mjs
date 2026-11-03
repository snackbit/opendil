import { mkdir } from "node:fs/promises";
import { cpus, platform, arch, release } from "node:os";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";

// Run against an existing production server; screenshots are spec assets.
const baseURL =
  process.env.DIL_BASE_URL ?? "http://127.0.0.1:3100/demo/showcase/";
const replayURL = new URL(baseURL);
replayURL.searchParams.set("benchmark", "1");
let server;
async function ensureServer() {
  if (process.env.DIL_BASE_URL) return;
  try {
    if ((await fetch(baseURL)).ok) return;
  } catch {
    /* Start the owned preview below. */
  }
  server = spawn(
    process.execPath,
    [
      resolve("node_modules/astro/bin/astro.mjs"),
      "preview",
      "--ignore-lock",
      "--host",
      "127.0.0.1",
      "--port",
      "3100",
    ],
    { cwd: resolve("apps/demo"), stdio: "ignore" },
  );
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(baseURL)).ok) return;
    } catch {
      /* Wait for startup. */
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error("Demo preview did not start");
}
const output = resolve("docs/dil-assets");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 1100 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
});
function scopedPage(host) {
  const frame = host.frameLocator("iframe").first();
  return new Proxy(host, {
    get(target, key) {
      if (key === "getByRole")
        return (role, options) => {
          const name = options?.name;
          return typeof name === "string" &&
            [
              "Replay stream",
              "Demo settings",
              "Iframe",
              "Pause",
              "Resume",
              "Complete",
              "Showcase",
              "Isolation",
              "Large document",
              "Long list",
              "Long table",
              "1×",
              "4×",
              "16×",
              "Preview",
            ].includes(name)
            ? host.getByRole(role, options)
            : frame.getByRole(role, options);
        };
      if (["locator", "getByText", "getByLabel"].includes(key))
        return frame[key].bind(frame);
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
const page = scopedPage(await context.newPage());
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

async function ready(target) {
  await expect(target.locator('[data-complete="true"]')).toBeAttached({
    timeout: 30000,
  });
  await target.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );
}
async function selectIframe(target) {
  await target
    .getByRole("button", { name: "Demo settings", exact: true })
    .click();
  await target.getByRole("radio", { name: "Iframe", exact: true }).click();
  await target.keyboard.press("Escape");
}

async function capture(name, target) {
  if (name !== "streaming-chart")
    await expect(target.locator("[data-dil-pending]")).toHaveCount(0);
  await target.screenshot({
    path: resolve(output, name + ".png"),
    animations: "disabled",
    style: "header, .od-workbench-controls { visibility: hidden !important; }",
  });
  console.log("Captured " + name);
}

function card(text) {
  return page
    .locator('[data-d-component="box"]')
    .filter({ hasText: text })
    .first();
}

async function installMeasurement() {
  await page.evaluate(() => {
    const pending = [];
    const latencies = [];
    const longTasks = [];
    const input = (event) =>
      pending.push({ length: event.detail.length, start: performance.now() });
    const commit = (event) => {
      const consumed = event.detail.scanned;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          while (pending[0] && pending[0].length <= consumed + 2) {
            latencies.push(performance.now() - pending.shift().start);
          }
        }),
      );
    };
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration);
    });
    observer.observe({ type: "longtask", buffered: false });
    window.addEventListener("dil:input", input);
    window.addEventListener("dil:commit", commit);
    window.dilSpecMeasurement = {
      latencies,
      longTasks,
      stop() {
        observer.disconnect();
        window.removeEventListener("dil:input", input);
        window.removeEventListener("dil:commit", commit);
      },
    };
  });
}

async function benchmark(speed, expectedCharacters) {
  await page
    .getByRole("button", { name: "Demo settings", exact: true })
    .click();
  await page.getByRole("radio", { name: speed + "×", exact: true }).click();
  await page.keyboard.press("Escape");
  await installMeasurement();
  const started = Date.now();
  await page
    .getByRole("button", { name: "Replay stream", exact: true })
    .click();
  await expect(page.locator('[data-complete="false"]')).toBeAttached();
  if (speed === "1") {
    await page.mouse.wheel(0, -5000);
    await page
      .getByRole("textbox", { name: "A note that survives scrolling" })
      .fill("Edited while streaming");
  }
  await ready(page);
  const elapsedMs = Date.now() - started;
  const result = await page.evaluate(() => {
    const measurement = window.dilSpecMeasurement;
    measurement.stop();
    const sorted = [...measurement.latencies].sort((a, b) => a - b);
    const percentile = (p) => sorted[Math.floor(sorted.length * p)] ?? null;
    return {
      updates: sorted.length,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      p99Ms: percentile(0.99),
      maxLatencyMs: sorted.at(-1) ?? null,
      longTaskCount: measurement.longTasks.length,
      maxLongTaskMs: measurement.longTasks.length
        ? Math.max(...measurement.longTasks)
        : null,
      mountedBlocks: 0,
      parsedCharacters: 0,
    };
  });
  result.mountedBlocks = await page
    .locator('[data-dil-content] [data-d-component="box"]')
    .count();
  result.parsedCharacters = Number(
    await page.locator("[data-scanned]").getAttribute("data-scanned"),
  );
  if (
    !result.updates ||
    result.parsedCharacters !== expectedCharacters ||
    result.p95Ms === null
  ) {
    throw new Error(
      "Replay did not produce a complete set of measurable source updates",
    );
  }
  if (speed === "1") {
    const input = page.getByRole("textbox", {
      name: "A note that survives scrolling",
    });
    await expect(input).toHaveValue("Edited while streaming");
    await expect(input).toBeFocused();
  }
  const row = {
    speed: Number(speed),
    codeUnitsPerUpdate: 4096 * Number(speed),
    intervalMs: 33,
    elapsedMs,
    ...result,
  };
  console.log("Benchmark " + JSON.stringify(row));
  return row;
}

try {
  await ensureServer();
  await page.goto(replayURL.href);
  await selectIframe(page);
  await ready(page);
  await capture("dashboard", card("Acme Analytics"));
  await capture("pricing", card("Configure your workspace"));
  await capture("charts", card("Categorical bar chart"));
  await capture("diagram", card("Service architecture"));
  await page
    .getByRole("textbox", { name: "Display name", exact: true })
    .fill("Felix");
  await page.getByRole("radio", { name: "Emerald", exact: true }).click();
  await page.getByRole("slider", { name: "Corner radius" }).focus();
  await page.keyboard.press("End");
  await capture("playground", card("UI component lab"));
  const photo = page.getByRole("img", { name: /^architectural photography/ });
  await photo.scrollIntoViewIfNeeded();
  await expect
    .poll(() => photo.evaluate((image) => image.naturalWidth))
    .toBeGreaterThan(0);
  await capture("gallery", page.locator('[data-slot="carousel"]'));

  // Pause while the chart's source is still arriving; no speculative chart skeleton is mounted.
  await page.exposeFunction("pauseDILCapture", () =>
    page.getByRole("button", { name: "Pause", exact: true }).click(),
  );
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (
        !document.body?.textContent?.includes("Performance trend") ||
        document.querySelector("[data-chart-type]")
      )
        return;
      observer.disconnect();
      void window.pauseDILCapture();
    });
    observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-label"],
    });
  });
  await page
    .getByRole("button", { name: "Replay stream", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText("Performance trend", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-chart-type]")).toHaveCount(0);
  await capture("streaming-chart", card("Acme Analytics"));
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await ready(page);

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const mobile = scopedPage(await mobileContext.newPage());
  await mobile.goto(baseURL);
  await mobile.getByRole("radio", { name: "Preview", exact: true }).click();
  await selectIframe(mobile);
  await ready(mobile);
  await mobile.screenshot({
    path: resolve(output, "mobile.png"),
    animations: "disabled",
  });
  console.log("Captured mobile");
  await mobileContext.close();

  const siteAssets = resolve("apps/demo/src/site/assets");
  await mkdir(siteAssets, { recursive: true });
  const exampleContext = await browser.newContext({
    viewport: { width: 1280, height: 1100 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const examplePage = await exampleContext.newPage();
  for (const id of ["pricing", "charts", "graph"]) {
    await examplePage.goto(new URL("../" + id + "/", baseURL).href);
    const preview = examplePage.locator('[data-dil-mode="shadow"]');
    await expect(preview.locator('[data-complete="true"]')).toBeAttached();
    const card = preview.locator('[data-d-component="box"]').first();
    await expect(card).toBeVisible();
    if (id === "charts")
      await expect(
        preview.locator(".recharts-bar-rectangle").first(),
      ).toBeVisible();
    if (id === "graph")
      await expect(preview.locator(".react-flow__node").first()).toBeVisible();
    await card.screenshot({
      path: resolve(siteAssets, id + ".png"),
      animations: "disabled",
    });
    console.log("Captured website example: " + id);
  }
  await exampleContext.close();

  // Measurements use the same viewport and animation settings as acceptance tests.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page
    .getByRole("radio", { name: "Large document", exact: true })
    .click();
  await ready(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: resolve(output, "large-document.png"),
    animations: "disabled",
  });
  console.log("Captured large-document");
  const benchmarks = [];
  const expectedCharacters = Number(
    await page.locator("[data-scanned]").getAttribute("data-scanned"),
  );
  for (const speed of ["1", "4", "16"])
    benchmarks.push(await benchmark(speed, expectedCharacters));
  const environment = {
    measuredAt: new Date().toISOString(),
    node: process.version,
    os: platform(),
    arch: arch(),
    kernel: release(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    browser: await browser.version(),
    browserReported: await page.evaluate(() => ({
      hardwareConcurrency: navigator.hardwareConcurrency,
      devicePixelRatio: devicePixelRatio,
      userAgent: navigator.userAgent,
    })),
    viewport: page.viewportSize(),
  };
  await page.getByRole("radio", { name: "Isolation", exact: true }).click();
  await page.getByLabel("Mermaid diagram").locator("svg").waitFor();
  await capture("mermaid", page.getByLabel("Mermaid diagram"));
  if (errors.length) throw new Error("Browser errors: " + errors.join("; "));
  console.log("RESULT " + JSON.stringify({ environment, benchmarks }));
} finally {
  await context.close();
  await browser.close();
  server?.kill();
}
