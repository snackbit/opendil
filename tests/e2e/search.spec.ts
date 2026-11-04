import { expect, test, type Page } from "@playwright/test";
import { basePathOf, watchPageProblems } from "./site-helpers";

interface IndexEntry {
  url: string;
  content: string;
}

/** Every { url, content } record in the exported index, whatever its nesting. */
function indexEntries(value: unknown, found: IndexEntry[] = []): IndexEntry[] {
  if (Array.isArray(value)) {
    for (const item of value) indexEntries(item, found);
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.url === "string" && typeof record.content === "string")
      found.push({ url: record.url, content: record.content });
    for (const item of Object.values(record)) indexEntries(item, found);
  }
  return found;
}

/** Opens the search dialog, retrying until hydration has attached the trigger. */
async function openSearch(page: Page, open: () => Promise<void>) {
  const input = page.getByRole("dialog").getByRole("combobox", {
    name: "Search",
  });
  await expect(async () => {
    await open();
    await expect(input).toBeVisible({ timeout: 1000 });
  }).toPass();
  return input;
}

test("the search button finds page text and opens the matching page", async ({
  page,
  baseURL,
}) => {
  const base = basePathOf(baseURL);
  const problems = watchPageProblems(page, baseURL);
  await page.goto("docs/");
  const input = await openSearch(page, () =>
    page
      .getByRole("button", { name: /search/i })
      .filter({ visible: true })
      .first()
      .click(),
  );

  await input.fill("runtimeBaseUrl");
  const result = page
    .getByRole("option")
    .filter({ hasText: /runtimeBaseUrl/i })
    .first();
  await expect(result).toBeVisible();
  await result.click();

  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page).toHaveURL(
    new RegExp(`^[^#]*${base}/docs/[a-z][^#]*/(#.*)?$`),
  );
  await expect(
    page.locator("article, main").getByText("runtimeBaseUrl").first(),
  ).toBeAttached();
  expect(problems).toEqual([]);
});

test("the keyboard shortcut opens search and Escape closes it", async ({
  page,
}) => {
  await page.goto("docs/getting-started/");
  const input = await openSearch(page, () =>
    page.keyboard.press("ControlOrMeta+k"),
  );
  await expect(input).toBeFocused();
  await input.fill("streaming");
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("generated component tables are searchable", async ({ page, request }) => {
  // "supply for generation" comes only from the spec's aria-label property note, which
  // <ComponentProps> turns into a table cell; the page prose never says it.
  const response = await request.get("api/search/");
  expect(response.status()).toBe(200);
  const entries = indexEntries(await response.json());
  expect(
    entries.some(
      (entry) =>
        /^\/docs\/components\/inputs\/?(#|$)/.test(entry.url) &&
        /supply for generation/i.test(entry.content),
    ),
    "an Inputs index entry contains the generated table text",
  ).toBe(true);

  await page.goto("docs/");
  const input = await openSearch(page, () =>
    page.keyboard.press("ControlOrMeta+k"),
  );
  await input.fill("supply for generation");
  await expect(
    page
      .getByRole("option")
      .filter({ hasText: /supply for generation/i })
      .first(),
  ).toBeVisible();
});
