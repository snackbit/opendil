import { expect, test, type Locator } from "@playwright/test";
import { closeSettings, openShowcase, replaceSource } from "./site-demo-page";

const source = [
  "| Rank | Name | Source | Memorability | Typeability | Clarity | Total | Comment |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  "| 1 | Sweeplog | Claude Haiku | 8 | 9 | 10 | 27 | Instantly conveys sweeping up logs and is easy to type and say. |",
  "",
  "| Check | Result |",
  "| --- | --- |",
  "| Lint | Pass |",
  "",
  "| Identifier | Status |",
  "| --- | --- |",
  `| ${"a".repeat(120)} | Complete |`,
].join("\n");

function lineCount(locator: Locator) {
  return locator.evaluate((element) => {
    const text = element.ownerDocument.createRange();
    text.selectNodeContents(element);
    return text.getClientRects().length;
  });
}

function horizontalOverflow(locator: Locator) {
  return locator.evaluate(
    (element) => element.scrollWidth - element.clientWidth,
  );
}

for (const mode of ["Iframe", "Shadow DOM", "Host DOM"] as const) {
  test(`${mode} wraps whole words and scrolls wide Markdown tables within the document`, async ({
    page,
  }) => {
    await openShowcase(page);
    if (mode !== "Iframe") {
      await page.getByRole("button", { name: "Demo settings" }).click();
      await page.getByRole("radio", { name: mode, exact: true }).click();
      await closeSettings(page);
    }
    const ui = mode === "Iframe" ? page.frameLocator("iframe") : page;
    await replaceSource(
      page,
      page.getByRole("textbox", { name: "DIL source", exact: true }),
      source,
    );

    const document = ui.locator(".dil-document");
    await document.evaluate((element) => (element.style.width = "360px"));
    const header = ui.getByRole("columnheader", { name: "Memorability" });
    await expect(header).toBeVisible();
    await expect.poll(() => lineCount(header)).toBe(1);

    const tableRegion = ui.getByRole("region", { name: "Markdown table" });
    const wide = tableRegion.filter({ hasText: "Memorability" });
    await expect.poll(() => horizontalOverflow(wide)).toBeGreaterThan(0);
    await expect.poll(() => horizontalOverflow(document)).toBe(0);

    await wide.focus();
    await wide.press("ArrowRight");
    await expect
      .poll(() => wide.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
    await wide.evaluate(
      (element) => (element.scrollLeft = element.scrollWidth),
    );
    const comment = wide.getByRole("cell", { name: /^Instantly conveys/ });
    await expect(comment).toBeInViewport();
    await expect.poll(() => lineCount(comment)).toBeGreaterThan(1);

    const compact = tableRegion.filter({ hasText: "Check" });
    await expect.poll(() => horizontalOverflow(compact)).toBe(0);

    const long = tableRegion.filter({ hasText: "Identifier" });
    await long.evaluate(
      (element) => (element.scrollLeft = element.scrollWidth),
    );
    await expect(long.getByRole("cell", { name: "Complete" })).toBeInViewport();
  });
}
