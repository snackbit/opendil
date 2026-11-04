import { expect, test, type Page } from "@playwright/test";
import { watchPageProblems } from "./site-helpers";

declare global {
  interface Window {
    themeMarker?: string;
    themeAtFirstContent?: string;
  }
}

const mainNav = (page: Page) =>
  page.getByRole("navigation", { name: "Main navigation" });

const themeToggle = (page: Page, theme: "light" | "dark") =>
  page.getByRole("button", { name: `Switch to ${theme} theme`, exact: true });

/** Clicks the header sun/moon toggle until the site is painted in `theme`. */
async function chooseTheme(page: Page, theme: "light" | "dark") {
  // A click before hydration does nothing; retry until the toggle responds.
  await expect(async () => {
    const toggle = themeToggle(page, theme);
    if (await toggle.isVisible()) await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme, {
      timeout: 1000,
    });
  }).toPass();
}

async function expectTheme(page: Page, theme: "light" | "dark") {
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-theme", theme);
  if (theme === "dark") await expect(root).toHaveClass(/\bdark\b/);
  else await expect(root).not.toHaveClass(/\bdark\b/);
  // DESIGN.md canvas: #ffffff light, #12141c dark.
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    theme === "dark" ? "rgb(18, 20, 28)" : "rgb(255, 255, 255)",
  );
}

test("the theme choice survives client navigation and reload", async ({
  page,
  baseURL,
}) => {
  const problems = watchPageProblems(page, baseURL);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("./");
  await expectTheme(page, "light");
  await page.evaluate(() => {
    window.themeMarker = "same-document";
  });

  await chooseTheme(page, "dark");
  await expectTheme(page, "dark");
  await expect(themeToggle(page, "light")).toBeVisible();

  await mainNav(page).getByRole("link", { name: "Docs" }).click();
  await expect(page).toHaveURL(/\/docs\/$/);
  await expectTheme(page, "dark");
  await mainNav(page).getByRole("link", { name: "Playground" }).click();
  await expect(page).toHaveURL(/\/demo\/[\w-]+\/$/);
  await expectTheme(page, "dark");
  expect(await page.evaluate(() => window.themeMarker)).toBe("same-document");

  // The stored choice is on <html> when the header is parsed: before first paint and hydration.
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (!document.querySelector(".od-site-header")) return;
      const root = document.documentElement;
      window.themeAtFirstContent = `${root.dataset.theme} ${root.className}`;
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
  await page.reload();
  expect(await page.evaluate(() => window.themeAtFirstContent)).toMatch(
    /^dark .*\bdark\b/,
  );
  expect(await page.evaluate(() => window.themeMarker)).toBeUndefined();
  await expect(themeToggle(page, "light")).toBeVisible();
  await expect(page.locator(".od-theme-icon-dark")).toBeVisible();
  await expect(page.locator(".od-theme-icon-light")).toBeHidden();

  // Without a stored choice the site follows the operating system preference, live.
  await page.evaluate(() => localStorage.removeItem("opendil-theme"));
  await page.reload();
  await expectTheme(page, "light");
  await expect(themeToggle(page, "dark")).toBeVisible();
  await page.emulateMedia({ colorScheme: "dark" });
  await expectTheme(page, "dark");
  await expect(themeToggle(page, "light")).toBeVisible();
  expect(problems).toEqual([]);
});

test("the landing renderer follows the site theme in both directions", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("./");
  // The generated interface, not the workbench toolbar around it.
  const scope = page.locator(".od-hero-output .dil-scope").first();
  await expect(scope).toHaveAttribute("data-theme", "light");
  await chooseTheme(page, "dark");
  await expect(scope).toHaveAttribute("data-theme", "dark");
  await chooseTheme(page, "light");
  await expect(scope).toHaveAttribute("data-theme", "light");
});

test("the docs shell has a header search, 240px sidebar, fluid article, and outline", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  const search = page.locator(".od-header").getByRole("button", {
    name: /^Search/,
  });
  await expect(search).toHaveCount(0);

  await page.goto("docs/language/");
  const header = await page.locator(".od-site-header").boundingBox();
  expect(header?.height).toBe(64);
  await expect(
    mainNav(page).getByRole("link", { name: "Docs" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(search).toBeVisible();
  // Wide screens show the sidebar itself; the drawer button is for narrow ones.
  await expect(page.getByRole("button", { name: "Docs menu" })).toBeHidden();
  await search.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  const sidebar = await page.locator("#nd-sidebar").boundingBox();
  expect(sidebar).toMatchObject({ x: 0, y: 64, width: 240 });
  const prose = await page.locator("#nd-page .prose").boundingBox();
  const outline = page.locator("#nd-toc");
  await expect(outline.getByText("On this page")).toBeVisible();
  const toc = await outline.boundingBox();
  expect(toc!.x).toBeGreaterThan(prose!.x + prose!.width);
  // DESIGN.md section 8: the article fills the space between the sidebar and the
  // 232px outline instead of stopping at a fixed reading width.
  expect(toc?.width).toBe(232);
  const article = await page.locator("#nd-page").boundingBox();
  expect(article?.x).toBe(240);
  expect(article!.x + article!.width).toBeCloseTo(toc!.x, 0);
  expect(prose?.width).toBeGreaterThan(760);
  // DESIGN.md section 8 colours: subtle sidebar, violet-tinted current page, canvas article.
  const docsColours = async (theme: "light" | "dark") => {
    await expectTheme(page, theme);
    const dark = theme === "dark";
    await expect(page.locator("#nd-sidebar")).toHaveCSS(
      "background-color",
      dark ? "rgb(35, 39, 53)" : "rgb(246, 247, 249)",
    );
    await expect(page.locator('#nd-sidebar a[data-active="true"]')).toHaveCSS(
      "background-color",
      dark ? "rgb(48, 42, 85)" : "rgb(240, 238, 255)",
    );
  };
  await docsColours("light");
  await chooseTheme(page, "dark");
  await docsColours("dark");
  await chooseTheme(page, "light");

  // The header stays put while the article scrolls under it.
  await page.mouse.wheel(0, 1200);
  await expect
    .poll(async () => (await page.locator(".od-site-header").boundingBox())?.y)
    .toBe(0);
  expect((await page.locator("#nd-sidebar").boundingBox())?.y).toBe(64);
});

test("narrow docs open the page tree from the header menu button", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("docs/language/");
  await expect(page.locator("#nd-sidebar")).toBeHidden();
  await page.getByRole("button", { name: "Docs menu" }).click();
  const drawer = page.getByRole("complementary");
  const introduction = drawer.getByRole("link", { name: "Introduction" });
  await expect(introduction).toBeVisible();
  await introduction.click();
  await expect(page).toHaveURL(/\/docs\/$/);
  await expect(drawer).toBeHidden();
  // The page has no horizontal overflow at phone width.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("the skip link moves focus past the docs sidebar into the article", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("docs/language/");
  await expect(page.locator("#nd-sidebar")).toBeVisible();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  // Before hydration the link falls back to the content wrapper; retry until main takes focus.
  await expect(async () => {
    await skip.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused({ timeout: 1000 });
  }).toPass();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() =>
      Boolean(document.activeElement?.closest("#nd-page")),
    ),
  ).toBe(true);
});

test("Ctrl+K opens search only on docs pages, where the header offers it", async ({
  page,
}) => {
  const dialog = page.getByRole("dialog");
  await page.goto("docs/");
  // A key press before hydration does nothing; retry until the shortcut responds.
  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Registered after the search listener, so it sees whether search handled the key.
  await page.evaluate(() => {
    window.addEventListener("keydown", (event) => {
      document.body.dataset.lastKeyHandled = String(event.defaultPrevented);
    });
  });
  await mainNav(page).getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    mainNav(page).getByRole("link", { name: "Home" }),
  ).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Control+k");
  await expect(page.locator("body")).toHaveAttribute(
    "data-last-key-handled",
    "false",
  );
  await expect(dialog).toHaveCount(0);
});
