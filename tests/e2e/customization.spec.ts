import { expect, test } from "@playwright/test";
import { openShowcase } from "./dil-page";

for (const mode of ["Host DOM", "Shadow DOM"] as const) {
  test(`${mode} custom components receive configuration, actions, styles, and independent state`, async ({
    page,
  }) => {
    await page.goto("/demo/customization/");
    await page
      .getByRole("button", { name: "Demo settings", exact: true })
      .click();
    await page.getByRole("radio", { name: mode, exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Custom callout")).toContainText(
      "Consumer component",
    );
    await expect(page.getByLabel("Custom callout")).toHaveCSS(
      "padding",
      "16px",
    );
    const action = page.getByRole("button", {
      name: "Custom increment",
      exact: true,
    });
    await expect(action).toBeEnabled();
    await action.click();
    await expect(
      page.getByText("Custom count: 1", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Host neighbor count: 0", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Increment host neighbor" }).click();
    await expect(
      page.getByText("Host neighbor count: 1", { exact: true }),
    ).toBeVisible();
    await expect(action).toHaveClass(/rounded-full/);
    await expect(
      page.getByRole("button", { name: "Increment host neighbor" }),
    ).toHaveClass(/consumer-stock-button/);
    await page.getByRole("button", { name: "Toggle custom theme" }).click();
    await expect(page.locator('[data-theme="dark"]')).toHaveCount(1);
    await expect(
      page.getByText("Custom count: 1", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Show component error" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Custom component failed",
    );
    await page.getByRole("button", { name: "Increment host neighbor" }).click();
    await expect(
      page.getByText("Host neighbor count: 2", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Restore component" }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}

test("static frame keeps its opaque origin and denies network requests", async ({
  page,
}) => {
  await openShowcase(page);
  const frame = page.frameLocator("iframe");
  await expect(frame.locator('[data-complete="true"]')).toBeAttached();
  const runtime = page
    .frames()
    .find((item) => item.url().includes("/opendil/frame.html"));
  expect(runtime).toBeDefined();
  const blocked = await runtime?.evaluate(async () => {
    let parentBlocked = false;
    try {
      void parent.document;
    } catch {
      parentBlocked = true;
    }
    let networkBlocked = false;
    try {
      await fetch("https://example.com/");
    } catch {
      networkBlocked = true;
    }
    return { parentBlocked, networkBlocked };
  });
  expect(blocked).toEqual({ parentBlocked: true, networkBlocked: true });
});
