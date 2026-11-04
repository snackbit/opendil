import { expect, type Page } from "@playwright/test";
import { closeSettings } from "./dil-page";

export {
  closeSettings,
  dilPage,
  paneScrollsAfterWheel,
  previewPane,
  replaceSource,
  scrollPreview,
  tailGap,
  watchPaneScrollsAfterWheel,
} from "./dil-page";

/*
 * The playground helpers for site-*.spec.ts. Unlike dil-page.ts, URLs are relative to the
 * configured baseURL so they follow SITE_BASE_PATH.
 */
export async function openShowcase(page: Page, query = "") {
  await page.goto("demo/showcase/" + query);
  // Core containment regressions deliberately exercise the package's iframe mode.
  await page
    .getByRole("button", { name: "Demo settings", exact: true })
    .click();
  await page.getByRole("radio", { name: "Iframe", exact: true }).click();
  await closeSettings(page);
  await expect(page.locator("iframe")).toBeVisible();
}
