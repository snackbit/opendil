#!/usr/bin/env node
/**
 * Production check of the Next.js site (apps/site) under a subpath.
 *
 * Builds with SITE_BASE_PATH=/opendil into its own dist directory, asserts that
 * every route is prerendered, starts `next start`, and checks the spec and
 * Markdown routes, llms.txt, the search index, the frame CSP header, live
 * examples, the playground, the agent spec page, docs search, and a crawl of
 * every internal href. Requires a built package (npm run build:package).
 *
 * CHECK_SITE_PORT overrides the port (default 3102).
 */
import { readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import {
  assertPortFree,
  cleanupOnExit,
  printGrouped,
  runProcessGroup,
  startProcessGroup,
  waitForServer,
  wasInterrupted,
} from "./check-server.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const site = join(root, "apps/site");
const nextBin = join(
  createRequire(join(site, "package.json")).resolve("next/package.json"),
  "../dist/bin/next",
);
const basePath = "/opendil";
const distDir = ".next-check-site";
const port = Number(process.env.CHECK_SITE_PORT ?? 3102);
const origin = "http://127.0.0.1:" + port;
const base = origin + basePath;
const env = {
  ...process.env,
  SITE_BASE_PATH: basePath,
  NEXT_DIST_DIR: distDir,
  NEXT_TELEMETRY_DISABLED: "1",
};
const specFiles = {
  "/agent-spec.md": "genui.agent.md",
  "/agent-spec.full.md": "genui.agent.full.md",
  "/agent-spec.examples.md": "genui.examples.md",
};
/**
 * Pages with live examples. Charts must draw the bar chart in Shadow DOM; the
 * rendering-modes page shows iframe and Shadow DOM side by side.
 */
const livePages = [
  {
    path: "/docs/components/charts/",
    visible: '[data-dil-mode="shadow"] [data-chart-type="bar"]',
  },
  { path: "/docs/rendering-modes/", shadow: true, isolated: true },
];
const searchQuery = "QuickJS";
/** A heading of the primary spec, which the Agent Spec page renders in full. */
const specHeading = "1. Output format and safety";
const failures = [];
const fail = (message) => failures.push(message);

/** Fails on any route that is not prerendered: static paths must be built, dynamic ones need dynamicParams = false. */
async function assertPrerendered() {
  const read = async (file) =>
    JSON.parse(await readFile(join(site, distDir, file), "utf8"));
  const [appRoutes, prerender, middleware, functions, pagesRoutes] =
    await Promise.all([
      read("app-path-routes-manifest.json"),
      read("prerender-manifest.json"),
      read("server/middleware-manifest.json"),
      read("server/functions-config-manifest.json"),
      read("server/pages-manifest.json"),
    ]);
  const routes = [...new Set(Object.values(appRoutes))].sort();
  for (const route of routes) {
    if (route.includes("[")) {
      const dynamic = prerender.dynamicRoutes[route];
      if (!dynamic || dynamic.fallback !== false)
        fail(
          `Dynamic route ${route} is not fully prerendered (needs generateStaticParams and dynamicParams = false)`,
        );
    } else if (!prerender.routes[route])
      fail(`Route ${route} is rendered on demand, not prerendered`);
  }
  const extraPages = Object.keys(pagesRoutes).filter(
    (route) =>
      !["/404", "/500", "/_app", "/_document", "/_error"].includes(route),
  );
  if (extraPages.length)
    fail("Pages Router routes are not static: " + extraPages.join(", "));
  if (
    Object.keys(middleware.middleware).length ||
    Object.keys(middleware.functions ?? {}).length ||
    Object.keys(functions.functions ?? {}).length
  )
    fail("The site must not ship middleware, proxy or server functions");
  return routes.length;
}

/** Strips fenced code, indented or not, so DIL and TSX samples do not count as leftover MDX. */
function markdownProse(text) {
  return text.replace(
    /^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm,
    "",
  );
}

async function checkMachineRoutes() {
  for (const [path, file] of Object.entries(specFiles)) {
    const response = await fetch(base + path);
    const expected = await readFile(join(root, "spec", file));
    const actual = Buffer.from(await response.arrayBuffer());
    if (!response.ok) fail(`${path}: HTTP ${response.status}`);
    else if (!actual.equals(expected))
      fail(`${path} is not byte-identical to spec/${file}`);
    if (!response.headers.get("content-type")?.startsWith("text/markdown"))
      fail(`${path}: content-type ${response.headers.get("content-type")}`);
  }
  const frame = await fetch(base + "/opendil/frame.html");
  if (
    frame.headers.get("content-security-policy") !==
    "sandbox allow-scripts; frame-ancestors 'self'"
  )
    fail("frame.html CSP: " + frame.headers.get("content-security-policy"));
  const search = await fetch(base + "/api/search");
  if (!search.ok) fail("/api/search: HTTP " + search.status);
  else await search.json().catch(() => fail("/api/search is not JSON"));
  const full = await fetch(base + "/llms-full.txt");
  if (!full.ok || !(await full.text()).trim())
    fail("/llms-full.txt is missing or empty");

  const llms = await fetch(base + "/llms.txt");
  if (!llms.ok) {
    fail("/llms.txt: HTTP " + llms.status);
    return [];
  }
  const links = [...(await llms.text()).matchAll(/\]\(([^)\s]+)\)/g)].map(
    ([, href]) => new URL(href, base + "/"),
  );
  const markdownUrls = [];
  for (const link of links) {
    if (!link.pathname.startsWith(basePath + "/"))
      fail(`llms.txt link ${link.href} lacks the base path ${basePath}`);
    else if (link.pathname.endsWith(".md"))
      markdownUrls.push(origin + link.pathname);
  }
  if (!markdownUrls.some((url) => url.includes("/docs/")))
    fail("llms.txt lists no docs .md URLs");
  await Promise.all(
    markdownUrls.map(async (url) => {
      const response = await fetch(url);
      const text = await response.text();
      if (!response.ok) return fail(`${url}: HTTP ${response.status}`);
      if (!response.headers.get("content-type")?.startsWith("text/markdown"))
        fail(`${url}: content-type ${response.headers.get("content-type")}`);
      if (!/^#\s/m.test(text)) fail(`${url} has no Markdown heading`);
      // Docs pages are generated from MDX; the agent spec files are served as written.
      if (!new URL(url).pathname.startsWith(basePath + "/docs")) return;
      // JSX components (DIL tags are lowercase) and MDX ESM lines.
      const jsx =
        /^\s*<\/?[A-Z][\w.]*[\s/>]|^import\s(?:[^\n]*\sfrom\s+)?["']|^export\s+(?:const|let|function|default|\{)/m.exec(
          markdownProse(text),
        );
      if (jsx) fail(`${url} contains MDX source: ${jsx[0].trim()}`);
    }),
  );
  return markdownUrls;
}

/** Crawls every internal href and src from the HTML pages; each must answer 200 or redirect to a page that does. */
async function crawl(seeds) {
  const seen = new Set();
  const queue = [];
  let pages = 0;
  const visit = async (url, from) => {
    const response = await fetch(url, { redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      const location = new URL(response.headers.get("location") ?? "", url);
      if (location.origin === origin) enqueue(location.href, url);
      else fail(`${url} redirects off-site to ${location.href}`);
      return;
    }
    if (response.status !== 200)
      return fail(`${url} (linked from ${from}): HTTP ${response.status}`);
    if (!response.headers.get("content-type")?.startsWith("text/html")) return;
    pages++;
    const html = await response.text();
    for (const [, tag, attributes] of html.matchAll(/<([a-z]+)\s([^>]*)>/g)) {
      const raw = /(?:^|\s)(?:href|src)="([^"]*)"/.exec(attributes)?.[1];
      // Connection hints name an origin, not a resource.
      if (
        raw === undefined ||
        (tag === "link" &&
          /\srel="(?:preconnect|dns-prefetch)"/.test(" " + attributes))
      )
        continue;
      const href = raw.replaceAll("&amp;", "&");
      if (
        !href ||
        href.startsWith("#") ||
        /^(?:data|mailto|javascript):/.test(href)
      )
        continue;
      const target = new URL(href, url);
      if (target.origin !== origin) continue;
      if (
        target.pathname !== basePath &&
        !target.pathname.startsWith(basePath + "/")
      ) {
        fail(`${url} links ${href} outside the base path ${basePath}`);
        continue;
      }
      target.hash = "";
      enqueue(target.href, url);
    }
  };
  const enqueue = (url, from) => {
    if (seen.has(url)) return;
    seen.add(url);
    queue.push([url, from]);
  };
  for (const url of seeds) enqueue(url, "seed");
  // At most 8 requests in flight; finished visits pull the next queued URL.
  let active = 0;
  await new Promise((done) => {
    const pump = () => {
      while (active < 8 && queue.length) {
        const [url, from] = queue.shift();
        active++;
        visit(url, from)
          .catch((error) =>
            fail(`${url} (linked from ${from}): ${error.message}`),
          )
          .finally(() => {
            active--;
            pump();
          });
      }
      if (!active && !queue.length) done();
    };
    pump();
  });
  return { urls: seen.size, pages };
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

async function expectRendered(page, { shadow, isolated, visible }) {
  await revealAll(page);
  if (visible) {
    const element = page.locator(visible).first();
    await element.scrollIntoViewIfNeeded({ timeout: 30000 });
    await expect(element).toBeVisible();
  }
  if (shadow)
    await expect(
      page.locator('[data-dil-mode="shadow"] [data-complete="true"]').first(),
    ).toBeAttached({ timeout: 30000 });
  if (isolated) {
    const iframe = page.locator('iframe[src*="frame.html"]').first();
    await iframe.scrollIntoViewIfNeeded({ timeout: 30000 });
    const src = new URL(await iframe.getAttribute("src"), page.url());
    if (src.pathname !== basePath + "/opendil/frame.html")
      fail(`Iframe runtime at ${src.pathname}, expected under ${basePath}`);
    await expect(
      page
        .frameLocator('iframe[src*="frame.html"]')
        .first()
        .locator(".dil-document"),
    ).toBeVisible({ timeout: 30000 });
  }
}

async function checkBrowser(browser) {
  // Clipboard access lets the Agent Spec step read what "Copy Markdown" copied.
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const errors = [];
  context.on("page", (opened) =>
    opened.on("pageerror", (error) =>
      errors.push(opened.url() + ": " + error.message),
    ),
  );
  context.on("response", (response) => {
    if (response.status() >= 400 && response.url().startsWith(origin))
      errors.push(response.status() + " " + response.url());
  });
  const page = await context.newPage();
  // Each step reports its own failure so one run lists every broken feature.
  const step = (name, task) =>
    task().catch((error) =>
      fail(`${name}: ${error.message.split("\n").slice(0, 3).join(" ")}`),
    );

  await step("Search", async () => {
    await page.goto(base + "/docs/");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("ControlOrMeta+k");
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").fill(searchQuery);
    const result = dialog
      .getByRole("option")
      .filter({ hasText: new RegExp(searchQuery, "i") })
      .first();
    await expect(result).toBeVisible({ timeout: 15000 });
    await result.click();
    await expect(page).toHaveURL(new RegExp(`${basePath}/docs/.+`));
  });

  for (const { path, ...modes } of livePages)
    await step("Live example " + path, async () => {
      await page.goto(base + path);
      await expectRendered(page, modes);
    });

  await step("Customization playground", async () => {
    await page.goto(base + "/docs/custom-components/");
    await revealAll(page);
    const increment = page
      .getByRole("button", { name: "Custom increment", exact: true })
      .first();
    await increment.scrollIntoViewIfNeeded({ timeout: 30000 });
    await increment.click();
    await expect(
      page.getByText("Custom count: 1", { exact: true }).first(),
    ).toBeVisible();
  });

  await step("Agent Spec page", async () => {
    await page.goto(base + "/docs/agent-spec/");
    await page.reload();
    // The heading's name also includes its "Copy Anchor Link" button.
    await expect(
      page.getByRole("heading", { name: specHeading }).first(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Copy Markdown", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Copied Markdown", exact: true }),
    ).toBeVisible({ timeout: 10000 });
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    // Processed Markdown may keep Fumadocs' heading ID suffix: "## Title [#id]".
    const heading = new RegExp(
      `^#+ ${specHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: \\[#[^\\]]+\\])?$`,
      "m",
    );
    if (!heading.test(copied))
      throw new Error("Copy Markdown did not copy the primary spec");
  });

  // A fresh tab: the playground keeps its render mode in sessionStorage.
  await step("Playground", async () => {
    const playground = await context.newPage();
    const frameRequests = [];
    playground.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith("/frame.js"))
        frameRequests.push(request.url());
    });
    await playground.goto(base + "/demo/showcase/");
    await playground.reload();
    await expect(
      playground.getByRole("textbox", { name: "DIL source", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      playground.locator('[data-dil-mode="shadow"]').getByRole("heading", {
        name: "Interactive workspace",
        exact: true,
      }),
    ).toBeVisible({ timeout: 30000 });
    if (frameRequests.length)
      throw new Error(
        "The default playground requested the iframe runtime: " +
          frameRequests.join(", "),
      );
  });
  for (const error of errors) fail("Browser: " + error);
}

const nextEnv = join(site, "next-env.d.ts");
const savedNextEnv = await readFile(nextEnv, "utf8").catch(() => undefined);
/** The running build step or server. */
let child;
let browser;
const cleanup = cleanupOnExit(async () => {
  await browser?.close();
  await child?.stop();
  await rm(join(site, distDir), { recursive: true, force: true });
  // next build points next-env.d.ts at the dist directory it used; restore it.
  if (savedNextEnv !== undefined) await writeFile(nextEnv, savedNextEnv);
});
const build = async (args, label) => {
  child = startProcessGroup(args, { cwd: site, env });
  await runProcessGroup(child, label);
};
const timings = {};
const time = async (label, task) => {
  const started = performance.now();
  try {
    return await task();
  } finally {
    timings[label] = ((performance.now() - started) / 1000).toFixed(1) + "s";
  }
};
try {
  await assertPortFree(port, "CHECK_SITE_PORT");
  await rm(join(site, distDir), { recursive: true, force: true });
  await time("build", async () => {
    await build(["scripts/sync-runtime.mjs"], "sync-runtime");
    await build([nextBin, "build"], "next build");
  });
  const routeCount = await assertPrerendered();
  child = startProcessGroup(
    [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd: site, env },
  );
  await waitForServer(base + "/", child, 60);
  const markdownUrls = await time("routes", checkMachineRoutes);
  const crawled = await time("crawl", () =>
    crawl([base + "/", base + "/docs/", ...markdownUrls]),
  );
  // Playwright's own signal handlers would exit before cleanupOnExit stops the server.
  browser = await chromium.launch({
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  });
  await time("browser", () =>
    checkBrowser(browser).catch((error) => fail("Browser: " + error.message)),
  );
  const summary =
    `${routeCount} prerendered routes, ${markdownUrls.length} .md URLs from llms.txt, ` +
    `${crawled.urls} crawled URLs (${crawled.pages} HTML pages); ` +
    JSON.stringify(timings);
  if (wasInterrupted()) {
    // Cleanup closed the browser mid-check; its failures are not findings.
  } else if (failures.length) {
    console.error(`check-site: ${failures.length} failure(s):`);
    printGrouped(failures);
    console.error(summary);
    process.exitCode = 1;
  } else
    console.log(
      `check-site passed under ${basePath}/: ${summary}; search, live examples and playground render.`,
    );
} finally {
  await cleanup();
}
