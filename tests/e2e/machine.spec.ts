import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { specFiles } from "../../apps/site/lib/source/spec-files";
import { specRedirects } from "../../apps/site/redirects";

/** The deployment base path ("" or "/opendil"), taken from the configured baseURL. */
function basePathOf(baseURL: string | undefined): string {
  return new URL(baseURL ?? "/").pathname.replace(/\/$/, "");
}

/** Markdown link targets in order of appearance. */
function linkTargets(markdown: string): string[] {
  return [...markdown.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]!);
}

test("agent spec files are served byte for byte as Markdown", async ({
  request,
}) => {
  for (const spec of specFiles) {
    const response = await request.get(spec.url.slice(1));
    expect(response.status(), spec.url).toBe(200);
    expect(response.headers()["content-type"], spec.url).toMatch(
      /^text\/markdown/,
    );
    const expected = readFileSync("spec/" + spec.file);
    expect((await response.body()).equals(expected), spec.url).toBe(true);
  }
});

test("agent spec is reachable and copies its exact source", async ({
  page,
}) => {
  // The page embeds the primary spec below its H1; its Markdown twin adds heading anchors.
  const body = readFileSync("spec/genui.agent.md", "utf8").replace(
    /^# [^\n]*\n+/,
    "",
  );
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const mainNav = page.getByRole("navigation", { name: "Main navigation" });
  for (const route of ["./", "demo/deployment/", "docs/getting-started/"]) {
    await page.goto(route);
    await expect(mainNav.getByRole("link", { name: "Docs" })).toBeVisible();
    await expect(
      mainNav.getByRole("link", { name: "Agent Spec", exact: true }),
    ).toHaveCount(0);
  }
  await page.goto("docs/language/");
  // The card in the page body, not the "next page" footer link.
  await page
    .locator("article a[data-card]")
    .filter({ hasText: /^Agent Spec/ })
    .click();
  await expect(page).toHaveURL(/\/docs\/agent-spec\/$/);
  await page.reload();
  const heading = page.getByRole("heading", {
    level: 1,
    name: "Agent Spec",
    exact: true,
  });
  await expect(heading).toBeVisible();
  await page.getByRole("button", { name: "Copy Markdown" }).click();
  await expect(
    page.getByRole("button", { name: "Copied Markdown" }),
  ).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^# Agent Spec\n/);
  expect(copied.replace(/^(#+ .*?) \[#[^\]]+\]$/gm, "$1")).toContain(body);
  for (const width of [320, 375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(heading).toBeVisible();
    // Crossing a breakpoint transitions the off-canvas sidebar; measure the settled layout.
    await page.evaluate(() =>
      Promise.allSettled(
        document.getAnimations().map((animation) => animation.finished),
      ),
    );
    expect
      .soft(
        await page.evaluate(() => document.documentElement.scrollWidth),
        `${width}px`,
      )
      .toBeLessThanOrEqual(width);
  }
});

test("llms.txt lists the agent spec first, then the docs, with base-aware .md links", async ({
  request,
  baseURL,
}) => {
  const base = basePathOf(baseURL);
  const response = await request.get("llms.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^text\/plain/);
  const text = await response.text();
  expect(text.indexOf("## Agent Spec")).toBeGreaterThan(0);
  expect(text.indexOf("## Agent Spec")).toBeLessThan(text.indexOf("## Docs"));

  const targets = linkTargets(text);
  expect(targets[0]).toMatch(
    new RegExp(`^https?://[^/]+${base}/agent-spec\\.md$`),
  );
  const docs = targets.filter((target) => /\/docs[^#]*\.md$/.test(target));
  expect(docs.length).toBeGreaterThan(0);
  for (const target of targets) {
    const url = new URL(target);
    expect(url.pathname.startsWith(base + "/"), target).toBe(true);
    expect(url.pathname, target).toMatch(/\.(md|txt)$/);
    // Absolute links name the production origin; resolve their paths against this server.
    const local = await request.get(url.pathname.slice(base.length + 1));
    expect(local.status(), target).toBe(200);
    if (url.pathname.endsWith(".md")) {
      expect(local.headers()["content-type"], target).toMatch(
        /^text\/markdown/,
      );
      expect(await local.text(), target).toMatch(/^# \S/);
    }
  }
});

test("docs pages have Markdown twins and llms-full.txt concatenates them", async ({
  request,
  baseURL,
}) => {
  const base = basePathOf(baseURL);
  const page = await request.get("docs.md");
  expect(page.status()).toBe(200);
  expect(page.headers()["content-type"]).toMatch(/^text\/markdown/);
  const markdown = await page.text();
  expect(markdown).toMatch(/^# Introduction\n/);
  expect(markdown).not.toContain("<!DOCTYPE");

  const missing = await request.get("docs/does-not-exist.md");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["content-type"]).not.toMatch(/^text\/markdown/);

  const full = await request.get("llms-full.txt");
  expect(full.headers()["content-type"]).toMatch(/^text\/plain/);
  const text = await full.text();
  expect(text).toMatch(
    new RegExp(
      `<!-- Source: https?://[^/]+${base}/docs\\.md -->\\n\\n# Introduction\\n`,
    ),
  );

  // Exactly the sidebar's pages: llms.txt lists each of them once.
  const index = linkTargets(await (await request.get("llms.txt")).text());
  const sources = [...text.matchAll(/<!-- Source: (\S+) -->/g)].map(
    (match) => match[1]!,
  );
  expect(new Set(sources).size).toBe(sources.length);
  expect(sources.length).toBeGreaterThan(1);
  for (const source of sources) expect(index, source).toContain(source);
});

test("Markdown output links absolute .md URLs and leaves the spec files to llms.txt", async ({
  request,
  baseURL,
}) => {
  const base = basePathOf(baseURL);
  const text = await (await request.get("llms-full.txt")).text();
  const origin = new URL(/<!-- Source: (\S+) -->/.exec(text)![1]!).origin;

  const targets = linkTargets(text);
  expect(targets.filter((target) => target.startsWith("/"))).toEqual([]);
  const site = targets
    .filter((target) => target.startsWith(origin + "/"))
    .map((target) => new URL(target));
  const docs = site.filter((url) => url.pathname.startsWith(base + "/docs"));
  expect(docs.length).toBeGreaterThan(0);
  for (const url of site)
    expect(url.pathname.startsWith(base + "/"), url.href).toBe(true);
  for (const url of docs) expect(url.pathname, url.href).toMatch(/\.md$/);
  // Links to sidebar pages use the same .md URLs llms.txt lists. Broken links are check-links' job.
  const index = new Set(
    linkTargets(await (await request.get("llms.txt")).text()),
  );
  expect(docs.some((url) => index.has(url.origin + url.pathname))).toBe(true);

  // Coding agents get the spec files from llms.txt, not inlined into llms-full.txt.
  for (const spec of specFiles) {
    const body = readFileSync("spec/" + spec.file, "utf8")
      .replace(/^# [^\n]*\n+/, "")
      .slice(0, 400);
    expect(text, spec.file).not.toContain(body);
    expect(text, spec.file).toContain(`(${origin}${base}${spec.url})`);
  }

  // The raw full spec links its siblings by file name; those names redirect to the spec URLs.
  for (const { source, destination } of specRedirects) {
    const direct = await request.get(source.slice(1), { maxRedirects: 0 });
    expect(direct.status(), source).toBe(308);
    expect(direct.headers()["location"], source).toBe(base + destination);
    const followed = await request.get(source.slice(1));
    expect(followed.headers()["content-type"], source).toMatch(
      /^text\/markdown/,
    );
  }
});

test("search uses the exported index", async ({ page, request }) => {
  const index = await request.get("api/search/");
  expect(index.status()).toBe(200);
  expect(index.headers()["content-type"]).toMatch(/json/);

  const indexRequests: string[] = [];
  page.on("request", (sent) => {
    if (new URL(sent.url()).pathname.includes("/api/search"))
      indexRequests.push(sent.url());
  });
  await page.goto("docs/");
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Search" });
  await dialog.getByRole("combobox", { name: "Search" }).fill("Introduction");
  await expect(
    dialog.getByRole("option", { name: /Introduction/ }).first(),
  ).toBeVisible();
  // One download of the static index; queries never reach a server.
  expect(indexRequests.every((url) => !url.includes("query="))).toBe(true);
});

test("page actions copy, show and share the Markdown URL", async ({
  page,
  context,
  baseURL,
}) => {
  const base = basePathOf(baseURL);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("docs/");
  const origin = new URL(page.url()).origin;
  const markdownUrl = `${origin}${base}/docs.md`;

  await page.getByRole("button", { name: "Copy Markdown" }).click();
  await expect(
    page.getByRole("button", { name: "Copied Markdown" }),
  ).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^# Introduction\n/);

  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "View as Markdown" }),
  ).toHaveAttribute("href", `${base}/docs.md`);
  const prompt = (name: string, parameter: string) =>
    page
      .getByRole("link", { name })
      .getAttribute("href")
      .then((href) => new URL(href ?? "").searchParams.get(parameter) ?? "");
  expect(await prompt("Open in ChatGPT", "prompt")).toContain(markdownUrl);
  expect(await prompt("Open in Claude", "q")).toContain(markdownUrl);
});
