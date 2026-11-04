import { expect, test } from "@playwright/test";
import { redirects } from "../../apps/site/redirects";

test("routes share one document across client-side navigation", async ({
  page,
}) => {
  const documents: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "document") documents.push(request.url());
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { level: 1, name: /Generative interfaces/ }),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as { siteMarker?: string }).siteMarker = "kept";
  });
  documents.length = 0;

  await page.getByRole("link", { name: "Read the docs" }).click();
  await expect(page).toHaveURL(/\/docs\/$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Introduction" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Playground" }).first().click();
  await expect(page).toHaveURL(/\/demo\/deployment\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/docs\/$/);

  expect(
    await page.evaluate(() => (window as { siteMarker?: string }).siteMarker),
  ).toBe("kept");
  expect(documents).toEqual([]);
});

test("docs render MDX contract components and DIL highlighting", async ({
  page,
}) => {
  await page.goto("docs/");
  // A live example mounts its workbench only once it scrolls into view.
  const example = page.locator('[data-live-example="form"]');
  await example.scrollIntoViewIfNeeded();
  await expect(example.locator("[data-render-mode]")).toBeVisible({
    timeout: 15_000,
  });
  const fence = page.locator("figure", { hasText: "Hello from DIL" });
  await expect(fence).toContainText("greeting.dil");
  // The DIL grammar colors tags and directives differently from plain text.
  const colors = await fence
    .locator("span[style]")
    .evaluateAll(
      (spans) => new Set(spans.map((span) => span.getAttribute("style"))).size,
    );
  expect(colors).toBeGreaterThan(2);
});

test("every example has a playground route", async ({ request }) => {
  const response = await request.get("demo/form/");
  expect(response.status()).toBe(200);
});

test("the runtime frame carries its sandbox CSP", async ({ request }) => {
  const response = await request.get("opendil/frame.html");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-security-policy"]).toBe(
    "sandbox allow-scripts; frame-ancestors 'self'",
  );
});

test("moved URLs redirect to their new pages", async ({ request, baseURL }) => {
  const base = new URL(baseURL ?? "/").pathname.replace(/\/$/, "");
  for (const { source, destination, permanent } of redirects) {
    const response = await request.get(source.slice(1), { maxRedirects: 0 });
    expect(response.status(), source).toBe(permanent ? 308 : 307);
    expect(response.headers()["location"], source).toBe(base + destination);
  }
});
