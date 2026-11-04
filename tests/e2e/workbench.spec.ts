import { expect, test } from "@playwright/test";
test("documentation source disclosures use Collapsible", async ({ page }) => {
  await page.goto("/docs/customization/components/");
  await expect(
    page.locator(".sl-markdown-content details, .sl-markdown-content summary"),
  ).toHaveCount(0);
  const trigger = page.getByRole("button", { name: "DIL source", exact: true });
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("message.dil", { exact: true })).toBeVisible();
});
test("demo uses the homepage workbench with populated bounded panes", async ({
  page,
}, testInfo) => {
  await page.goto("/demo/deployment/");
  const frame = page.locator(".od-stream-demo");
  await expect(
    frame
      .locator(".od-hero-demo-toolbar")
      .getByRole("combobox", { name: "Open example" }),
  ).toBeVisible();
  await expect(
    frame
      .locator(".od-hero-code")
      .getByRole("textbox", { name: "DIL source", exact: true }),
  ).toBeVisible();
  await expect(
    frame
      .locator(".od-hero-output")
      .getByRole("heading", { name: "Ship something good.", exact: true }),
  ).toBeVisible();
  await expect(frame.locator(".od-hero-demo")).toHaveCSS("height", "700px");
  await expect(
    page.locator(".od-workbench-controls, .od-render-header"),
  ).toHaveCount(0);
  await testInfo.attach("shared-demo-workbench", {
    body: await frame.screenshot({ path: "/tmp/opendil-shared-demo.png" }),
    contentType: "image/png",
  });
});
test("playback settings start with reveal enabled and compact aligned choices", async ({
  page,
}, testInfo) => {
  await page.goto("/demo/deployment/");
  await page.getByRole("button", { name: "Demo settings" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Progressive reveal" }),
  ).toBeChecked();
  const choices = ["Iframe", "Shadow DOM", "Host DOM"];
  const boxes = await Promise.all(
    choices.map((name) =>
      page.getByRole("radio", { name, exact: true }).boundingBox(),
    ),
  );
  expect(
    boxes.every((box) => box && box.y === boxes[0]?.y && box.height <= 26),
  ).toBe(true);
  await testInfo.attach("compact-settings", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await page.getByRole("checkbox", { name: "Progressive reveal" }).uncheck();
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "Open example" }).click();
  await page.getByRole("option", { name: "pricing.dil", exact: true }).click();
  await page.getByRole("button", { name: "Demo settings" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Progressive reveal" }),
  ).not.toBeChecked();
});
test("Monaco edits DIL, persists drafts, and resets without an editor footer", async ({
  page,
}) => {
  await page.goto("/demo/form/");
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Auto-run", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "React usage", exact: true }),
  ).toHaveCount(0);
  const source = page.getByRole("textbox", { name: /DIL source/ });
  await page.locator(".od-source-editor").click({ position: { x: 90, y: 30 } });
  await source.press("ControlOrMeta+A");
  await page.keyboard.insertText("<box><title>A Monaco draft</title></box>");
  await expect(
    page.getByRole("heading", { name: "A Monaco draft" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A Monaco draft" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Make yourself at home.", exact: true }),
  ).toBeVisible();
});
test("appearance is optional compact popover content", async ({ page }) => {
  await page.goto("/demo/deployment/");
  await page.getByRole("button", { name: "Demo settings" }).click();
  await page.getByRole("radio", { name: "Iframe", exact: true }).click();
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("heading", { name: "Ship something good.", exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Host DOM", exact: true }).click();
  await expect(page.locator('[data-dil-mode="host"]')).toBeAttached();
  await page.getByRole("radio", { name: "Shadow DOM", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Shadow DOM", exact: true }),
  ).toHaveAttribute("data-state", "on");
  await page
    .getByRole("button", { name: "Output appearance", exact: true })
    .click();
  await page.getByRole("radio", { name: "Dark output", exact: true }).click();
  await page.getByRole("radio", { name: "Pill", exact: true }).click();
  await page.keyboard.press("Escape");
  const output = page.locator('[data-dil-mode="shadow"]').first();
  await expect(output.locator(".dil-scope")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await expect(
    output.getByRole("radio", { name: "US East", exact: true }),
  ).toHaveCSS("color", "rgb(250, 250, 250)");
  await output
    .getByRole("button", { name: "Deploy application", exact: true })
    .click();
  await expect(
    output.getByRole("button", { name: "Deployment created", exact: true }),
  ).toBeVisible();
});
