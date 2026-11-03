import { expect, test } from "@playwright/test";
test("draft editing, manual run, integration copy and reload preserve the intended state", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/demo/form/");
  const source = page.getByRole("textbox", { name: "DIL source", exact: true });
  const ui = page.locator('[data-dil-mode="shadow"]');
  await expect(
    ui.getByRole("heading", { name: "Make yourself at home.", exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Auto-run", exact: true }).click();
  const draft = "<box padding={4}><title>A saved draft</title></box>";
  await source.fill(draft);
  await expect(page.getByText("Edited", { exact: true })).toBeVisible();
  await expect(
    ui.getByRole("heading", { name: "Make yourself at home.", exact: true }),
  ).toBeVisible();
  await source.press("ControlOrMeta+Enter");
  await expect(
    ui.getByRole("heading", { name: "A saved draft", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Copy DIL source", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(draft);
  await page.getByRole("radio", { name: "React usage", exact: true }).click();
  await page
    .getByRole("button", { name: "Copy React integration", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('import { DilRenderer } from "@snackbit/opendil"');
  await page.reload();
  await expect(
    ui.getByRole("heading", { name: "A saved draft", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset example", exact: true })
    .click();
  await expect(
    ui.getByRole("heading", { name: "Make yourself at home.", exact: true }),
  ).toBeVisible();
});
test("custom appearance updates the live output and copied integration", async ({
  page,
}) => {
  await page.goto("/demo/deployment/");
  const modePicker = page.getByRole("combobox", {
    name: "Rendering mode",
    exact: true,
  });
  await expect(modePicker).toHaveText("Shadow DOM");
  await modePicker.click();
  await page.getByRole("option", { name: "Iframe", exact: true }).click();
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("heading", { name: "Ship something good.", exact: true }),
  ).toBeVisible();
  await expect(
    page.frameLocator("iframe").getByText("Complete", { exact: true }),
  ).toHaveCount(0);
  await modePicker.click();
  await page.getByRole("option", { name: "Host DOM", exact: true }).click();
  await expect(page.locator('[data-dil-mode="host"]')).toBeAttached();
  await expect(
    page
      .locator('[data-dil-mode="host"]')
      .getByText("Complete", { exact: true }),
  ).toHaveCount(0);
  await modePicker.click();
  await page.getByRole("option", { name: "Shadow DOM", exact: true }).click();
  await expect(page.locator('[data-dil-mode="shadow"]')).toBeAttached();
  await expect(
    page
      .locator('[data-dil-mode="shadow"]')
      .getByText("Complete", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Demo settings", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "Shadow DOM", exact: true }),
  ).toHaveAttribute("data-state", "on");
  await page.keyboard.press("Escape");
  await page.getByText("Output appearance", { exact: false }).first().click();
  await page.getByRole("radio", { name: "Dark output", exact: true }).click();
  await page.getByRole("radio", { name: "Pill", exact: true }).click();
  const output = page.locator('[data-dil-mode="shadow"]').first();
  await expect(output.locator(".dil-scope")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await output
    .getByRole("button", { name: "Deploy application", exact: true })
    .click();
  await expect(
    output.getByRole("button", { name: "Deployment created", exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "React usage", exact: true }).click();
  const snippet = page.getByRole("textbox", {
    name: "React integration code",
    exact: true,
  });
  await expect(snippet).toContainText('mode="shadow"');
  await expect(snippet).toContainText('appearance="dark"');
  await expect(snippet).toContainText("rounded-full");
});
