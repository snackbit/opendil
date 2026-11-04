import { expect, test } from "@playwright/test";
import { closeSettings, replaceSource } from "./site-demo-page";

/* Live examples and source disclosures inside docs pages. The playground is in site-workbench.spec.ts. */

test("documentation example tabs support editing in narrow containers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("docs/getting-started/");
  const example = page.locator(".od-live-example").first();
  await example.scrollIntoViewIfNeeded();
  const source = example.getByRole("tab", { name: "Source", exact: true });
  await source.click();
  await replaceSource(
    page,
    example.getByRole("textbox", { name: "DIL source", exact: true }),
    "<title>Narrow example</title>",
  );
  await source.press("ArrowRight");
  await expect(
    example.getByRole("tab", { name: "Preview", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    example.getByRole("heading", { name: "Narrow example" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
});

test("documentation examples can be edited, replayed and reset independently", async ({
  page,
}) => {
  await page.goto("docs/components/diagrams/");
  const examples = page.locator(".od-live-example");
  const first = examples.nth(0),
    second = examples.nth(1);
  await first.scrollIntoViewIfNeeded();
  const editor = first.getByRole("textbox", {
    name: "DIL source",
    exact: true,
  });
  await expect(editor).toBeVisible();
  await first.getByRole("button", { name: "Demo settings" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Progressive reveal" }),
  ).toBeChecked();
  await page.getByRole("radio", { name: "Host DOM", exact: true }).click();
  await expect(first.locator('[data-dil-mode="host"]')).toBeAttached();
  await page.getByRole("radio", { name: "Shadow DOM", exact: true }).click();
  await expect(first.locator('[data-dil-mode="shadow"]')).toBeAttached();
  await closeSettings(page, first);
  await replaceSource(page, editor, "<box><title>Edited example</title></box>");
  await expect(
    first.getByRole("heading", { name: "Edited example" }),
  ).toBeVisible();
  await first.getByRole("button", { name: "Replay", exact: true }).click();
  await first.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(
    first.getByRole("heading", { name: "Edited example" }),
  ).toBeVisible();
  await second.scrollIntoViewIfNeeded();
  await expect(
    second.getByRole("textbox", { name: "DIL source", exact: true }),
  ).toBeVisible();
  await expect(
    second.getByRole("heading", { name: "Edited example" }),
  ).toHaveCount(0);
  await expect(
    first.getByRole("heading", { name: "Edited example" }),
  ).toBeVisible();
  await first.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(
    first.getByRole("heading", { name: "Edited example" }),
  ).toHaveCount(0);
  // Docs edits are not playground drafts.
  await page.goto("demo/graph/");
  await expect(
    page.getByRole("textbox", { name: "DIL source", exact: true }),
  ).not.toContainText("Edited example");
});

test("documentation source disclosures use Collapsible", async ({ page }) => {
  await page.goto("docs/custom-components/");
  await expect(page.locator("article details, article summary")).toHaveCount(0);
  const trigger = page.getByRole("button", {
    name: "message.dil",
    exact: true,
  });
  const disclosure = page
    .locator('[data-slot="collapsible"]')
    .filter({ has: trigger });
  const content = disclosure.locator('[data-slot="collapsible-content"]');
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(content).toBeHidden();
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  // The trigger names the region it opened, which holds the highlighted source.
  await expect(content).toHaveAttribute(
    "id",
    (await trigger.getAttribute("aria-controls")) ?? "missing",
  );
  await expect(content).toBeVisible();
  await expect(content).toContainText("Custom increment");
});
