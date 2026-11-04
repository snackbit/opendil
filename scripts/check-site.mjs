import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
const exec = promisify(execFile);
const scratch = await mkdtemp(join(tmpdir(), "opendil-site-"));
let server,
  browser,
  diagnostics = "";
try {
  const { stdout, stderr } = await exec(
    process.execPath,
    [resolve("node_modules/astro/bin/astro.mjs"), "build", "--outDir", scratch],
    {
      cwd: resolve("apps/demo"),
      env: { ...process.env, SITE_BASE_PATH: "/opendil/" },
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  diagnostics = stdout + stderr;
  server = spawn(
    process.execPath,
    [
      resolve("node_modules/astro/bin/astro.mjs"),
      "preview",
      "--ignore-lock",
      "--outDir",
      scratch,
      "--host",
      "127.0.0.1",
      "--port",
      "3102",
    ],
    {
      cwd: resolve("apps/demo"),
      env: { ...process.env, SITE_BASE_PATH: "/opendil/" },
      stdio: "pipe",
    },
  );
  server.stderr.on("data", (chunk) => {
    diagnostics = (diagnostics + chunk).slice(-5000);
  });
  server.stdout.on("data", (chunk) => {
    diagnostics = (diagnostics + chunk).slice(-5000);
  });
  const base = "http://127.0.0.1:3102/opendil/";
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      ready = (await fetch(base)).ok;
    } catch {
      /* Wait for the owned preview. */
    }
    if (ready) break;
    await new Promise((done) => setTimeout(done, 100));
  }
  if (!ready) throw new Error("Subpath preview did not start: " + diagnostics);
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      errors.push(response.status() + " " + response.url());
  });
  await page.goto(base + "docs/language/");
  await page.getByRole("link", { name: "Agent Spec", exact: true }).click();
  await expect(page).toHaveURL(base + "agent-spec/");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Copy spec", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".agent-source")).toContainText(
    "# GenUI Agent Specification",
  );
  await page.goto(base);
  await expect(
    page.getByRole("heading", {
      name: "Generate interfaces. Keep control.",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Open playground", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "DIL source", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .locator('[data-dil-mode="shadow"]')
      .getByRole("button", { name: "Deploy application", exact: true }),
  ).toBeVisible();
  await page.goto(base + "docs/getting-started/");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("QuickJS");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("link", { name: /Isolation/ })
      .first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto(base + "docs/components/charts/");
  await expect(
    page.getByRole("heading", { name: "Charts", exact: true }),
  ).toBeVisible();
  await page.locator(".od-live-example").scrollIntoViewIfNeeded();
  await expect(
    page.locator('[data-dil-mode="shadow"] [data-chart-type="bar"]'),
  ).toBeVisible();
  await page.goto(base + "docs/customization/components/");
  const customization = page.locator('[data-customization-demo="components"]');
  await customization.scrollIntoViewIfNeeded();
  await customization
    .getByRole("button", { name: "Custom increment", exact: true })
    .click();
  await expect(
    customization.getByText("Custom count: 1", { exact: true }),
  ).toBeVisible();
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Verified static landing, direct example reload, docs search, runtime assets, and live docs under /opendil/.",
  );
} finally {
  await browser?.close();
  server?.kill();
  await rm(scratch, { recursive: true, force: true });
}
