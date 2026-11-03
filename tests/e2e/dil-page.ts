import { expect, type Page } from "@playwright/test";
export async function openShowcase(page: Page, query = "") {
  await page.goto("/demo/showcase/" + query);
  if ((page.viewportSize()?.width ?? 1280) < 768)
    await page.getByRole("radio", { name: "Preview", exact: true }).click();
  // Core containment regressions deliberately exercise the package's iframe mode.
  await page
    .getByRole("button", { name: "Demo settings", exact: true })
    .click();
  await page.getByRole("radio", { name: "Iframe", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("iframe")).toBeVisible();
}
/** Page object: fixture controls belong to the host; document controls belong to its frame. */
export function dilPage(page: Page) {
  const frame = page.frameLocator("iframe");
  return {
    locator: frame.locator.bind(frame),
    getByText: frame.getByText.bind(frame),
    getByLabel: frame.getByLabel.bind(frame),
    getByRole(
      role: Parameters<Page["getByRole"]>[0],
      options?: Parameters<Page["getByRole"]>[1],
    ) {
      const name = options?.name;
      const host =
        typeof name === "string" &&
        [
          "Replay stream",
          "Pause",
          "Resume",
          "Complete",
          "Showcase",
          "Large document",
          "Long list",
          "Long table",
          "1×",
          "4×",
          "16×",
        ].includes(name);
      return host
        ? page.getByRole(role, options)
        : frame.getByRole(role, options);
    },
  };
}
