import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  closeSettings,
  previewPane,
  scrollPreview,
  tailGap,
} from "./site-demo-page";

// The workbench preview pane is an overflow:auto scroll container, like most
// chat message lists. Tests that need page scrolling restyle it to grow instead.
const modes = ["Iframe", "Host DOM", "Shadow DOM"] as const;
type Mode = (typeof modes)[number];
type Layout = "container" | "page";

async function open(page: Page, path: string, mode: Mode, layout: Layout) {
  await page.goto(path);
  await page
    .getByRole("button", { name: "Demo settings", exact: true })
    .click();
  await page.getByRole("radio", { name: mode, exact: true }).click();
  await closeSettings(page);
  if (layout === "page")
    await page.addStyleTag({
      content: `.od-hero-demo, .od-hero-preview, .od-hero-output {
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
      }`,
    });
  const ui =
    mode === "Iframe"
      ? page.frameLocator("iframe").locator("body")
      : page.locator(
          `[data-dil-mode="${mode === "Host DOM" ? "host" : "shadow"}"]`,
        );
  const root =
    mode === "Iframe"
      ? page.locator("iframe")
      : page.locator(
          `[data-dil-mode="${mode === "Host DOM" ? "host" : "shadow"}"]`,
        );
  await expect(ui.locator('[data-complete="true"]')).toBeAttached();
  return { ui, root };
}
async function scrollTo(page: Page, layout: Layout, top: number) {
  if (layout === "container") await scrollPreview(page, top);
  else
    await page.evaluate(
      (top) =>
        new Promise<void>((done) => {
          window.scrollTo(0, top);
          requestAnimationFrame(() => requestAnimationFrame(() => done()));
        }),
      top,
    );
}
/** Distance from the renderer's bottom, plus `padding`, to the window's bottom. */
function pageTailGap(root: Locator, padding = 0) {
  return root.evaluate(
    (element, padding) =>
      Math.abs(element.getBoundingClientRect().bottom + padding - innerHeight),
    padding,
  );
}

for (const layout of ["container", "page"] as const)
  for (const mode of modes)
    test(`${mode} mounts virtualized rows while the ${layout} scrolls`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const { ui } = await open(page, "demo/list/", mode, layout);
      const first = ui.getByRole("button", {
        name: "Inspect Entry 1",
        exact: true,
      });
      await expect(first).toBeVisible();
      // A focused row stays mounted while the reader scrolls away from it. A
      // real click waits until progressive reveal makes the row interactive.
      await first.click();
      await expect(first).toBeFocused();
      await scrollTo(page, layout, 10_000_000);
      await expect(
        ui.getByRole("button", { name: "Inspect Entry 5000", exact: true }),
      ).toBeVisible();
      expect(
        await ui.getByRole("button", { name: /^Inspect Entry/ }).count(),
      ).toBeLessThan(100);
      await expect(first).toBeFocused();
      // Moving focus elsewhere without scrolling releases the row.
      await page
        .getByRole("button", { name: "Replay", exact: true })
        .evaluate((button) => button.focus({ preventScroll: true }));
      await expect(first).not.toBeAttached();
      // Halfway down, rows mount where the reader is rather than at either end.
      const middle = await (layout === "container"
        ? previewPane(page).evaluate((element) => element.scrollHeight / 2)
        : page.evaluate(() => document.documentElement.scrollHeight / 2));
      await scrollTo(page, layout, middle);
      await expect
        .poll(() =>
          ui.getByRole("button", { name: /^Inspect Entry/ }).evaluateAll(
            (buttons) =>
              buttons.filter((button) => {
                const box = button.getBoundingClientRect();
                return box.height > 0 && box.bottom > 0;
              }).length,
          ),
        )
        .toBeGreaterThan(0);
      await scrollTo(page, layout, 0);
      await expect(first).toBeVisible();
      expect(errors).toEqual([]);
    });

for (const mode of ["Host DOM", "Shadow DOM"] as const)
  test(`${mode} follows the stream inside its scroll container and yields to reading there`, async ({
    page,
  }) => {
    const { root } = await open(
      page,
      "demo/showcase/?benchmark=1",
      mode,
      "container",
    );
    const jump = page.getByRole("button", {
      name: "Jump to latest",
      exact: true,
    });
    const pane = previewPane(page);
    const scrollTop = () => pane.evaluate((element) => element.scrollTop);
    await page.getByRole("button", { name: "Replay", exact: true }).click();
    await expect.poll(scrollTop).toBeGreaterThan(0);
    await expect.poll(() => tailGap(root)).toBeLessThan(100);
    await expect(jump).toHaveCount(0);
    // A wheel elsewhere on the page scrolls something else and leaves following alone.
    await page.locator(".od-hero-demo-toolbar").hover();
    const beforeWheel = await scrollTop();
    await page.mouse.wheel(0, -200);
    // Following continues: the pane moves on toward the growing tail without a pause.
    await expect.poll(scrollTop).toBeGreaterThan(beforeWheel);
    await expect(jump).toHaveCount(0);
    // Keyboard reading inside the container pauses.
    await pane.focus();
    await page.keyboard.press("PageUp");
    await expect(jump).toBeVisible();
    const top = await scrollTop();
    await expect.poll(scrollTop).toBeLessThanOrEqual(top + 20);
    await jump.click();
    await expect(jump).toHaveCount(0);
    await expect.poll(() => tailGap(root)).toBeLessThan(100);
    // Headless Chromium draws overlay scrollbars, so scrollbar presses are
    // covered by unit tests; wheeling over the container pauses here.
    await pane.hover();
    await page.mouse.wheel(0, -400);
    await expect(jump).toBeVisible();
    await jump.click();
    await expect(jump).toHaveCount(0);
    await expect(root.locator('[data-complete="true"]')).toBeAttached({
      timeout: 30000,
    });
    await expect.poll(() => tailGap(root)).toBeLessThan(100);
  });

for (const mode of ["Iframe", "Host DOM"] as const)
  test(`${mode} still follows the page when the page scrolls`, async ({
    page,
  }) => {
    const { root } = await open(
      page,
      "demo/showcase/?benchmark=1",
      mode,
      "page",
    );
    const jump = page.getByRole("button", {
      name: "Jump to latest",
      exact: true,
    });
    await page.getByRole("button", { name: "Replay", exact: true }).click();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await expect.poll(() => pageTailGap(root)).toBeLessThan(100);
    await expect(jump).toHaveCount(0);
    await page.mouse.move(640, 450);
    await page.mouse.wheel(0, -600);
    await expect(jump).toBeVisible();
    const top = await page.evaluate(() => scrollY);
    await expect
      .poll(() => page.evaluate(() => scrollY))
      .toBeLessThanOrEqual(top + 20);
    await jump.click();
    await expect(jump).toHaveCount(0);
    await expect.poll(() => pageTailGap(root)).toBeLessThan(100);
  });
