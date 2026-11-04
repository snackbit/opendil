import { gzipSync } from "node:zlib";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { scrollThrough, settle, trackRequests } from "./site-helpers";

/** Gzip budget for all JavaScript a text-only docs page loads, prefetches included. */
const budgetBytes = 320 * 1024;

/** Strings only the OpenDIL renderer chunk contains (the styled renderer, about 1.5 MB raw). */
const rendererMarker = /data-dil-(?:mode|renderer)/;

/** Docs pages without live examples or playgrounds; their JavaScript is the site shell only. */
const textOnlyPages = [
  "docs/limits/",
  "docs/security/",
  "docs/troubleshooting/",
  "docs/package/",
  "docs/agent-spec/",
];

interface ScriptLoad {
  url: string;
  gzipBytes: number;
  renderer: boolean;
}

/** Loads a page in a fresh context and records every script it fetches, workers included. */
async function measureScripts(
  context: BrowserContext,
  page: Page,
  path: string,
): Promise<ScriptLoad[]> {
  const pending: Promise<ScriptLoad | undefined>[] = [];
  context.on("response", (response) => {
    const url = response.url();
    if (
      response.request().resourceType() !== "script" &&
      !/\.m?js(\?|$)/.test(new URL(url).pathname)
    )
      return;
    pending.push(
      response.body().then(
        (body) => ({
          url,
          gzipBytes: gzipSync(body).length,
          renderer: rendererMarker.test(body.toString("utf8")),
        }),
        () => undefined,
      ),
    );
  });
  trackRequests(page);
  const response = await page.goto(path);
  expect(response?.status(), path).toBe(200);
  await settle(page);
  // In-view links prefetch their routes; scrolling brings the footer links into view.
  await scrollThrough(page);
  await settle(page);
  return (await Promise.all(pending)).filter((load) => load !== undefined);
}

const kilobytes = (bytes: number) => (bytes / 1024).toFixed(1) + " KB";

for (const path of textOnlyPages) {
  test(`${path} stays within the JavaScript budget without the renderer`, async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const scripts = await measureScripts(context, page, path);
    await context.close();

    const total = scripts.reduce((sum, script) => sum + script.gzipBytes, 0);
    const largest = [...scripts]
      .sort((a, b) => b.gzipBytes - a.gzipBytes)
      .slice(0, 5)
      .map(
        (script) =>
          `${new URL(script.url).pathname} ${kilobytes(script.gzipBytes)}`,
      );
    testInfo.annotations.push({
      type: "js-gzip",
      description: `${scripts.length} scripts, ${kilobytes(total)}; largest: ${largest.join(", ")}`,
    });

    expect(
      scripts.filter((script) => script.renderer).map((script) => script.url),
      "OpenDIL renderer chunk",
    ).toEqual([]);
    expect(
      scripts
        .map((script) => new URL(script.url).pathname)
        .filter((pathname) => /\/opendil\/(frame|vm)\.js$/.test(pathname)),
      "iframe runtime",
    ).toEqual([]);
    expect(
      total,
      `gzip JS; largest: ${largest.join(", ")}`,
    ).toBeLessThanOrEqual(budgetBytes);
  });
}

test("the renderer marker identifies the OpenDIL chunk on a page that renders DIL", async ({
  browser,
}) => {
  // Guards the budget test against passing vacuously if the marker strings change.
  const context = await browser.newContext();
  const page = await context.newPage();
  const scripts = await measureScripts(context, page, "demo/form/");
  await context.close();
  expect(scripts.some((script) => script.renderer)).toBe(true);
});
