import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

// Records the landing-page stream for the README. Needs ffmpeg and a running
// production preview (`npm run preview -w @opendil/demo`).
const baseURL = process.env.DIL_BASE_URL ?? "http://127.0.0.1:3100/";
const output = resolve("docs/dil-assets/streaming-demo.gif");
const viewport = { width: 1280, height: 900 };
try {
  if (!(await fetch(baseURL)).ok) throw new Error("HTTP error");
} catch {
  throw new Error("Start the production preview before recording: " + baseURL);
}
const scratch = await mkdtemp(join(tmpdir(), "opendil-readme-"));
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "no-preference",
    recordVideo: { dir: scratch, size: viewport },
  });
  const page = await context.newPage();
  const opened = Date.now();
  await page.goto(baseURL);
  const demo = page.locator(".od-stream-demo");
  await demo.scrollIntoViewIfNeeded();
  const progress = demo.getByRole("progressbar", {
    name: "Demo source received",
  });
  // The demo starts on its own when visible; record a clean replay instead.
  await expect(progress).toHaveAttribute("aria-valuenow", "100", {
    timeout: 30000,
  });
  const box = await demo.boundingBox();
  if (!box) throw new Error("Missing demo frame");
  await page.waitForTimeout(500);
  const start = Date.now();
  await demo.getByRole("button", { name: "Replay", exact: true }).click();
  await expect(progress).toHaveAttribute("aria-valuenow", "100", {
    timeout: 30000,
  });
  await page.waitForTimeout(1200);
  const preview = demo.getByLabel("Streaming preview");
  const slider = preview.getByRole("slider", { name: "Team members" });
  await preview.evaluate((element) =>
    element.scrollTo({ top: 0, behavior: "smooth" }),
  );
  await page.waitForTimeout(700);
  await slider.focus();
  for (let step = 0; step < 10; step++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(110);
  }
  await preview
    .getByRole("checkbox", { name: /Annual billing/ })
    .click({ force: true });
  await page.waitForTimeout(1800);
  const end = Date.now();
  await context.close();
  const video = await page.video()?.path();
  if (!video) throw new Error("Missing recording");
  const crop = [box.width, box.height, box.x, box.y].map(Math.round).join(":");
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-ss",
    String((start - opened) / 1000),
    "-t",
    String((end - start) / 1000),
    "-i",
    video,
    "-vf",
    `crop=${crop},fps=10,scale=880:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`,
    "-loop",
    "0",
    output,
  ]);
  console.log("Recorded " + output);
} finally {
  await browser.close();
  await rm(scratch, { recursive: true, force: true });
}
