#!/usr/bin/env node
/**
 * Checks that `next dev` for the site (apps/site) keeps serving pages, client
 * chunks and the iframe runtime while the package dist republishes.
 *
 * Opens a docs page with iframe and Shadow DOM examples and the playground,
 * then republishes the current packages/opendil/dist with the package build's
 * atomic publishDirectory (without running the build) while sampling routes,
 * client chunks and /opendil/frame.js. Asserts zero failed samples, that the
 * runtime watcher re-copied frame.js, that dist matches its manifest, and that
 * both pages still render. Also checks that the dev server serves the runtime
 * to the opaque frame and does not expose repository files. Requires a built
 * package.
 *
 * The republish writes identical bytes, but it still replaces the files in
 * the shared dist, so watchers of other dev servers reload. Do not run it
 * while a package build, test:e2e, check:rebuild or another server that
 * watches packages/opendil/dist is running. If a build publishes during the
 * run anyway, the check fails and names the files to rebuild.
 *
 * CHECK_REBUILD_PORT overrides the port (default 5180).
 */
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import {
  MANIFEST,
  publishDirectory,
} from "../packages/opendil/bin/publish-directory.mjs";
import {
  assertPortFree,
  cleanupOnExit,
  printGrouped,
  startProcessGroup,
  waitForServer,
  wasInterrupted,
} from "./check-server.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const site = join(root, "apps/site");
const dist = join(root, "packages/opendil/dist");
const runtimeCopy = join(site, "public/opendil/frame.js");
const nextBin = join(
  createRequire(join(site, "package.json")).resolve("next/package.json"),
  "../dist/bin/next",
);
const distDir = ".next-check-rebuild";
const port = Number(process.env.CHECK_REBUILD_PORT ?? 5180);
const base = "http://127.0.0.1:" + port;
const docsPath = "/docs/rendering-modes/";
const playgroundPath = "/demo/showcase/";
const failures = [];
const fail = (message) => failures.push(message);
/** Runs one check and records its failure, so one run reports every broken part. */
const step = (name, task) =>
  task().catch((error) =>
    fail(`${name}: ${error.message.split("\n").slice(0, 3).join(" ")}`),
  );
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * Copies the files the dist manifest lists and verifies their hashes, so the
 * copy is one complete publish even if another build runs at the same time.
 */
async function snapshotDist(staging) {
  const manifestText = await readFile(join(dist, MANIFEST), "utf8");
  const { files, ...metadata } = JSON.parse(manifestText);
  for (const [file, hash] of Object.entries(files)) {
    await cp(join(dist, file), join(staging, file));
    if (sha256(await readFile(join(staging, file))) !== hash)
      throw new Error(
        `packages/opendil/dist/${file} changed while it was copied; another build is publishing. Rerun later.`,
      );
  }
  return { manifestText, files: Object.keys(files), metadata };
}

/**
 * Checks every file the on-disk manifest lists against its hash. A build that
 * publishes at the same time as this check can leave files from both runs.
 */
async function verifyDist(snapshot) {
  const manifestText = await readFile(join(dist, MANIFEST), "utf8");
  const changed = [];
  for (const [file, hash] of Object.entries(JSON.parse(manifestText).files)) {
    const bytes = await readFile(join(dist, file)).catch(() => undefined);
    if (!bytes || sha256(bytes) !== hash) changed.push(file);
  }
  if (changed.length)
    fail(
      `packages/opendil/dist no longer matches its manifest (${changed.slice(0, 5).join(", ")}${changed.length > 5 ? ", ..." : ""}); another build published at the same time. Run npm run build:package.`,
    );
  else if (manifestText !== snapshot.manifestText)
    fail(
      "Another build published packages/opendil/dist during the check; dist is consistent, but rerun the check to test an unchanged republish.",
    );
}

/** Runs the runtime watcher and `next dev` in one process group. */
function startDevServer() {
  return startProcessGroup(
    [
      "scripts/sync-runtime.mjs",
      "--watch",
      "--",
      process.execPath,
      nextBin,
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: site,
      env: {
        ...process.env,
        NEXT_DIST_DIR: distDir,
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  );
}

/** The frame must load its runtime cross-site; repository files must stay private. */
async function checkServing() {
  const crossSite = {
    "Sec-Fetch-Site": "cross-site",
    "Sec-Fetch-Mode": "no-cors",
  };
  const frame = await fetch(base + "/opendil/frame.js", { headers: crossSite });
  if (frame.status !== 200)
    fail(
      "The opaque frame cannot load /opendil/frame.js: HTTP " + frame.status,
    );
  const privatePaths = [
    "/@fs" + join(dist, "index.js"),
    "/@fs" + join(site, "next.config.ts"),
    "/apps/site/next.config.ts",
    "/packages/opendil/src/index.ts",
    "/next.config.ts",
    "/package.json",
  ];
  for (const path of privatePaths) {
    const response = await fetch(base + path, { redirect: "manual" });
    if (response.status !== 404)
      fail(
        `Repository path ${path} answered HTTP ${response.status}, expected 404`,
      );
  }
}

/** Scrolls through the page so examples that mount when visible start rendering. */
async function revealAll(page) {
  await page.evaluate(async () => {
    for (let y = 0; y <= document.body.scrollHeight; y += innerHeight / 2) {
      scrollTo(0, y);
      await new Promise((done) => setTimeout(done, 150));
    }
  });
}

async function expectDocsRendered(page) {
  await revealAll(page);
  await expect(
    page.locator('[data-dil-mode="shadow"] [data-complete="true"]').first(),
  ).toBeAttached({ timeout: 60000 });
  const iframe = page.locator('iframe[src*="frame.html"]').first();
  await iframe.scrollIntoViewIfNeeded({ timeout: 60000 });
  await expect(
    page
      .frameLocator('iframe[src*="frame.html"]')
      .first()
      .locator(".dil-document"),
  ).toBeVisible({ timeout: 60000 });
}

/** The default playground renders in Shadow DOM, next to its editor. */
async function expectPlaygroundRendered(page) {
  await expect(
    page.getByRole("textbox", { name: "DIL source", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await expect(
    page.locator('[data-dil-mode="shadow"]').getByRole("heading", {
      name: "Interactive workspace",
      exact: true,
    }),
  ).toBeVisible({ timeout: 60000 });
}

/** Requests the routes, the runtime and a rotating slice of client chunks every 100 ms. */
function startSampling(chunks) {
  const routes = [docsPath, playgroundPath, "/opendil/frame.js"];
  const results = [];
  let next = 0;
  const timer = setInterval(() => {
    const slice = chunks.length
      ? Array.from(
          { length: Math.min(6, chunks.length) },
          () => chunks[next++ % chunks.length],
        )
      : [];
    for (const path of [...routes, ...slice])
      results.push(
        fetch(base + path).then(
          async (response) => {
            await response.arrayBuffer();
            return response.ok ? null : `${path} HTTP ${response.status}`;
          },
          (error) => `${path} ${error.message}`,
        ),
      );
  }, 100);
  return async () => {
    clearInterval(timer);
    const settled = await Promise.all(results);
    return { requests: settled.length, failed: settled.filter(Boolean) };
  };
}

async function waitForRecopy(before) {
  for (let attempt = 0; attempt < 75; attempt++) {
    const current = await stat(runtimeCopy).catch(() => undefined);
    if (current && current.mtimeMs > before) return true;
    await sleep(200);
  }
  return false;
}

const nextEnv = join(site, "next-env.d.ts");
const savedNextEnv = await readFile(nextEnv, "utf8").catch(() => undefined);
await mkdir(join(root, ".tmp"), { recursive: true });
const staging = await mkdtemp(join(root, ".tmp/check-rebuild-"));
let server;
let browser;
let stopSampling;
/** An interrupted check lets a running publish finish so dist keeps no temporary files. */
let publishing;
const cleanup = cleanupOnExit(async () => {
  await publishing?.catch(() => {});
  await stopSampling?.();
  await browser?.close();
  await server?.stop();
  await rm(staging, { recursive: true, force: true });
  await rm(join(site, distDir), { recursive: true, force: true });
  // next dev points next-env.d.ts at the dist directory it used; restore it.
  if (savedNextEnv !== undefined) await writeFile(nextEnv, savedNextEnv);
});
const timings = {};
try {
  await assertPortFree(port, "CHECK_REBUILD_PORT");
  const snapshot = await snapshotDist(staging);
  let started = performance.now();
  server = startDevServer();
  // A public file answers without compiling a route, so content errors surface in the page checks.
  await waitForServer(base + "/opendil/frame.js", server, 120);
  timings.devReady = ((performance.now() - started) / 1000).toFixed(1) + "s";
  await checkServing();

  // Playwright's own signal handlers would exit before cleanupOnExit stops the server.
  browser = await chromium.launch({
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  const chunks = new Set();
  context.on("page", (page) =>
    page.on("pageerror", (error) =>
      errors.push(page.url() + ": " + error.message),
    ),
  );
  context.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.origin === base &&
      url.pathname.startsWith("/_next/static/") &&
      response.ok()
    )
      chunks.add(url.pathname + url.search);
  });
  const docs = await context.newPage();
  const playground = await context.newPage();
  // The default playground uses Shadow DOM and must never load the iframe runtime.
  const frameRequests = [];
  playground.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/frame.js"))
      frameRequests.push(request.url());
  });
  started = performance.now();
  await step("Docs page before republish", async () => {
    await docs.goto(base + docsPath);
    await expectDocsRendered(docs);
  });
  await step("Playground before republish", async () => {
    await playground.goto(base + playgroundPath);
    await expectPlaygroundRendered(playground);
  });
  timings.pagesReady = ((performance.now() - started) / 1000).toFixed(1) + "s";

  const copiedAt = (await stat(runtimeCopy)).mtimeMs;
  const logAfterPublish = server.capture();
  stopSampling = startSampling([...chunks]);
  await sleep(1000);
  if ((await readFile(join(dist, MANIFEST), "utf8")) !== snapshot.manifestText)
    throw new Error(
      "packages/opendil/dist changed during the check; another build is publishing. Rerun later.",
    );
  started = performance.now();
  publishing = publishDirectory(staging, dist, {
    files: snapshot.files,
    metadata: snapshot.metadata,
  });
  await publishing;
  timings.publish = ((performance.now() - started) / 1000).toFixed(2) + "s";
  if (!(await waitForRecopy(copiedAt)))
    fail("The runtime watcher did not re-copy frame.js after the republish");
  // Let Turbopack pick up the changed files and settle while sampling continues.
  await sleep(4000);
  const sampled = await stopSampling();
  stopSampling = undefined;
  for (const failure of sampled.failed) fail("Sample: " + failure);
  for (const line of logAfterPublish().split("\n"))
    if (/Module not found|Can't resolve|⨯/.test(line))
      fail("Dev server: " + line.trim());

  const served = Buffer.from(
    await (await fetch(base + "/opendil/frame.js")).arrayBuffer(),
  );
  if (!served.equals(await readFile(join(dist, "runtime/frame.js"))))
    fail(
      "/opendil/frame.js does not match packages/opendil/dist/runtime/frame.js",
    );
  await verifyDist(snapshot);

  await step("Docs page after republish", () => expectDocsRendered(docs));
  await step("Playground after republish", () =>
    expectPlaygroundRendered(playground),
  );
  await step("Docs page after reload", async () => {
    await docs.reload();
    await expectDocsRendered(docs);
  });
  await step("Playground after reload", async () => {
    await playground.reload();
    await expectPlaygroundRendered(playground);
  });
  for (const error of errors) fail("Browser: " + error);
  if (frameRequests.length)
    fail(
      "The default playground requested the iframe runtime: " +
        frameRequests.join(", "),
    );

  const summary =
    `${sampled.requests} samples over ${chunks.size} client chunks, 2 routes and frame.js; ` +
    JSON.stringify(timings);
  if (wasInterrupted()) {
    // Cleanup closed the browser mid-check; its failures are not findings.
  } else if (failures.length) {
    console.error(`check-rebuild: ${failures.length} failure(s):`);
    printGrouped(failures);
    console.error(summary);
    process.exitCode = 1;
  } else
    console.log(
      `check-rebuild passed: ${summary}; runtime re-copied; docs and playground render.`,
    );
} finally {
  await cleanup();
}
