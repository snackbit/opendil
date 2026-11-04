import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { basePathOf, docsPages } from "./site-helpers";

/**
 * The MDX contract's tab groups (framework: Next.js/Vite; backend: AI SDK/OpenAI/
 * Anthropic/fetch; pm: npm/pnpm/yarn/bun), each with a non-default choice to select.
 */
const groups = [
  { id: "framework", choice: "Vite" },
  { id: "backend", choice: "Anthropic" },
  { id: "pm", choice: "pnpm" },
];

/** Fumadocs stores the tab value lowercased with the first space replaced by "-". */
const storedValue = (item: string) => item.toLowerCase().replace(/\s/, "-");

/** Prerendered tab labels per docs page, read from the HTML so pages can move tabs freely. */
async function tabLabelsByPage(request: APIRequestContext) {
  const labels = new Map<string, string[]>();
  for (const path of docsPages) {
    const html = await (await request.get(path)).text();
    labels.set(
      path,
      [...html.matchAll(/role="tab"[^>]*>([^<]+)</g)].map((match) =>
        match[1]!.trim(),
      ),
    );
  }
  return labels;
}

/** Every tab with this label on the page is selected; returns how many there are. */
async function expectSelected(page: Page, label: string): Promise<number> {
  const tabs = page.getByRole("tab", { name: label, exact: true });
  await expect(tabs.first()).toBeVisible();
  for (const tab of await tabs.all())
    await expect(tab).toHaveAttribute("aria-selected", "true");
  return tabs.count();
}

/**
 * The docs plan puts the framework and pm groups twice on getting-started and backend
 * twice on chat-integration, and repeats each group on other pages, so both checks
 * below are backed by content.
 */
test("grouped tabs switch together, follow the reader across pages, and persist", async ({
  page,
  context,
  request,
  baseURL,
}) => {
  const base = basePathOf(baseURL);
  const labels = await tabLabelsByPage(request);
  const count = (path: string, label: string) =>
    labels.get(path)!.filter((found) => found === label).length;
  let groupsAcrossPages = 0;
  let groupsTwiceOnAPage = 0;

  for (const group of groups) {
    // Start on the page with the most tabs of this group.
    const pages = docsPages
      .filter((path) => count(path, group.choice) > 0)
      .sort((a, b) => count(b, group.choice) - count(a, group.choice));
    if (pages.length === 0) continue;
    if (pages.length > 1) groupsAcrossPages++;

    await test.step(`${group.id} tabs on ${pages.join(", ")}`, async () => {
      const [first, ...others] = pages as [string, ...string[]];
      await page.goto(first);
      // Clicks before hydration are lost; retry until the selection sticks.
      await expect(async () => {
        await page
          .getByRole("tab", { name: group.choice, exact: true })
          .first()
          .click();
        await expect(
          page.getByRole("tab", { name: group.choice, exact: true }).first(),
        ).toHaveAttribute("aria-selected", "true", { timeout: 1000 });
      }).toPass();
      // One click selected the choice in every instance of the group on the page.
      if ((await expectSelected(page, group.choice)) > 1) groupsTwiceOnAPage++;
      expect(
        await page.evaluate((key) => localStorage.getItem(key), group.id),
      ).toBe(storedValue(group.choice));

      // Readers move between pages through the sidebar, without a full load.
      await page.evaluate(() => {
        (window as { tabsMarker?: boolean }).tabsMarker = true;
      });
      for (const path of others) {
        await page
          .locator(`#nd-sidebar a[href="${base}/${path}"]`)
          .filter({ visible: true })
          .first()
          .click();
        await expect(page).toHaveURL(new URL(base + "/" + path, baseURL).href);
        await expectSelected(page, group.choice);
      }
      expect(
        await page.evaluate(
          () => (window as { tabsMarker?: boolean }).tabsMarker,
        ),
        "sidebar navigation kept the document",
      ).toBe(true);

      // A new tab has fresh sessionStorage, so this proves the localStorage persistence.
      const fresh = await context.newPage();
      await fresh.goto(first);
      await expectSelected(fresh, group.choice);
      await fresh.reload();
      await expectSelected(fresh, group.choice);
      await fresh.close();
    });
  }

  expect(groupsAcrossPages, "a tab group appears on two pages").toBeGreaterThan(
    0,
  );
  expect(
    groupsTwiceOnAPage,
    "a tab group appears twice on one page",
  ).toBeGreaterThan(0);
});
