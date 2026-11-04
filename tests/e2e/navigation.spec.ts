import { expect, test, type Page } from "@playwright/test";
import {
  basePathOf,
  docsPages,
  scrollThrough,
  settle,
  watchPageProblems,
} from "./site-helpers";

declare global {
  interface Window {
    siteMarker?: string;
  }
}

/**
 * Records main-frame document requests. Client-side navigation fetches RSC payloads
 * only, so any document request means a full reload. Iframe documents (isolated
 * live examples) belong to child frames and are ignored.
 */
function watchDocumentRequests(page: Page): string[] {
  const documents: string[] = [];
  page.on("request", (request) => {
    if (
      request.resourceType() === "document" &&
      request.frame() === page.mainFrame()
    )
      documents.push(request.url());
  });
  return documents;
}

/** Loads a route and waits until hydration has wired up its links. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await settle(page);
  await page.evaluate(() => {
    window.siteMarker = "same-document";
  });
}

async function expectSameDocument(page: Page, documents: string[]) {
  expect(await page.evaluate(() => window.siteMarker)).toBe("same-document");
  expect(documents, "full page loads during navigation").toEqual([]);
}

test("landing, docs and playground share one document across links, back and forward", async ({
  page,
  baseURL,
}) => {
  const base = basePathOf(baseURL);
  const at = (path: string) => new URL(base + path, baseURL).href;
  const heading = (name: string) =>
    page.getByRole("heading", { level: 1, name, exact: true });
  const link = (path: string) =>
    page.locator(`a[href="${base}${path}"]`).filter({ visible: true }).first();
  const problems = watchPageProblems(page, baseURL);
  const documents = watchDocumentRequests(page);

  await open(page, "./");
  documents.length = 0;

  await link("/docs/").click();
  await expect(page).toHaveURL(at("/docs/"));
  await expect(heading("Introduction")).toBeVisible();

  await link("/docs/getting-started/").click();
  await expect(page).toHaveURL(at("/docs/getting-started/"));
  await expect(heading("Quickstart")).toBeVisible();

  await link("/demo/deployment/").click();
  await expect(page).toHaveURL(at("/demo/deployment/"));
  await expect(page.locator("main").first()).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(at("/docs/getting-started/"));
  await expect(heading("Quickstart")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(at("/docs/"));
  await expect(heading("Introduction")).toBeVisible();
  await page.goForward();
  await expect(heading("Quickstart")).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(at("/demo/deployment/"));

  await page
    .locator(base ? `a[href="${base}/"], a[href="${base}"]` : 'a[href="/"]')
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(at("/"));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await expectSameDocument(page, documents);
  expect(problems).toEqual([]);
});

test("sidebar links, groups and table-of-contents anchors stay client-side", async ({
  page,
  baseURL,
}) => {
  const base = basePathOf(baseURL);
  const at = (path: string) => new URL(base + path, baseURL).href;
  const problems = watchPageProblems(page, baseURL);
  const documents = watchDocumentRequests(page);

  await open(page, "docs/getting-started/");
  documents.length = 0;

  // Groups are sidebar separators; the URLs stay flat.
  const sidebar = page.locator("#nd-sidebar");
  for (const group of [
    "Get started",
    "Guides",
    "Writing DIL",
    "Components",
    "Reference and concepts",
  ])
    await expect(sidebar.getByText(group, { exact: true })).toBeVisible();

  await sidebar
    .locator(`a[href="${base}/docs/components/inputs/"]`)
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(at("/docs/components/inputs/"));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await sidebar
    .locator(`a[href="${base}/docs/chat-integration/"]`)
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(at("/docs/chat-integration/"));
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Add OpenDIL to your chat app",
    }),
  ).toBeVisible();

  const anchor = page.locator('#nd-toc a[href^="#"]').first();
  const hash = await anchor.getAttribute("href");
  await anchor.click();
  await expect(page).toHaveURL(at("/docs/chat-integration/" + hash));

  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(at("/docs/components/inputs/"));

  await expectSameDocument(page, documents);
  expect(problems).toEqual([]);
});

/** Every docs page, the landing page, and playgrounds including the iframe-isolation example. */
const routes = [
  "./",
  "demo/deployment/",
  "demo/form/",
  "demo/isolation/",
  ...docsPages,
];

for (const path of routes) {
  test(`${path} loads without errors`, async ({ page, baseURL }) => {
    const problems = watchPageProblems(page, baseURL);
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await settle(page);
    // Live examples mount when visible, and in-view links prefetch: reach both.
    await scrollThrough(page);
    await settle(page);
    expect(problems).toEqual([]);
  });
}
