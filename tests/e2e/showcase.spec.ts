import { dilPage, openShowcase } from "./dil-page";
import { expect, test } from "@playwright/test";

test("renders the source and wires the showcase controls", async ({
  page,
  context,
}) => {
  const ui = dilPage(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openShowcase(page);
  await expect(ui.locator('[data-complete="true"]')).toBeAttached();
  await expect(
    ui.getByRole("heading", {
      name: "Interactive workspace",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    ui.getByRole("heading", { name: "Actions and code" }),
  ).toBeAttached();
  await expect(ui.locator('.dil-document [role="alert"]')).toHaveCount(0);
  for (const name of ["Billing", "Time range"]) {
    const corners = await ui
      .getByRole("radiogroup", { name, exact: true })
      .getByRole("radio")
      .evaluateAll((elements) =>
        elements.flatMap((element) => {
          const style = getComputedStyle(element);
          return [
            style.borderTopLeftRadius,
            style.borderTopRightRadius,
            style.borderBottomLeftRadius,
            style.borderBottomRightRadius,
          ].map(Number.parseFloat);
        }),
      );
    expect(corners.every((radius) => radius > 0)).toBe(true);
  }
  await ui.getByRole("radio", { name: "3M", exact: true }).click();
  await expect(ui.locator('[data-chart-type="line"]')).toHaveAttribute(
    "data-points",
    "3",
  );
  await ui.getByRole("radio", { name: "Users", exact: true }).click();
  await expect(
    ui.getByRole("checkbox", { name: "Show revenue target" }),
  ).toBeDisabled();
  await ui.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(ui.locator('[data-chart-type="line"]')).toHaveAttribute(
    "data-points",
    "6",
  );
  const breakdown = ui.getByRole("checkbox", {
    name: "Show monthly breakdown",
    exact: true,
  });
  await breakdown.check();
  await expect(
    ui.getByRole("cell", { name: "May", exact: true }),
  ).toBeVisible();
  await breakdown.uncheck();
  await expect(ui.getByRole("cell", { name: "May", exact: true })).toHaveCount(
    0,
  );
  await expect(
    ui.getByRole("checkbox", { name: "Show revenue target" }),
  ).toBeEnabled();
  await expect(ui.getByText("€213.60", { exact: true })).toBeVisible();
  await ui.getByRole("radio", { name: "Monthly", exact: true }).click();
  await expect(ui.getByText("€267.00", { exact: true })).toBeVisible();
  await ui.getByRole("checkbox", { name: /Advanced analytics/ }).uncheck();
  await expect(
    ui.getByRole("heading", { name: "€232.00", exact: true }),
  ).toBeVisible();
  const copy = ui.getByRole("button", { name: "Copy configuration" });
  await copy.click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("Monthly: €232.00");
  await expect(ui.locator(".dil-tooltip")).toContainText("Copied");
  await expect(copy).toBeFocused();
  await expect(ui.locator(".dil-tooltip")).toHaveCount(0, { timeout: 4000 });
  await ui.getByRole("textbox", { name: "Display name" }).fill("Felix");
  await expect(
    ui.getByRole("heading", { name: "Welcome back, Felix" }),
  ).toBeVisible();
  await ui.getByRole("button", { name: "Test interaction" }).click();
  await expect(ui.getByText("Action triggered for Felix.")).toBeVisible();
  await ui.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(ui.getByText("Action triggered for Felix.")).toHaveCount(0);
  await ui.getByRole("radio", { name: "Emerald", exact: true }).click();
  await ui.getByRole("slider", { name: "Corner radius" }).focus();
  await page.keyboard.press("Home");
  await expect(ui.getByText("Radius: 4px · comfortable layout")).toBeVisible();
  await ui.getByRole("button", { name: "Database", exact: true }).click();
  await expect(
    ui.getByRole("heading", { name: "1024 MB", exact: true }),
  ).toBeVisible();
  await ui
    .getByRole("checkbox", {
      name: "Analytics integration complete",
      exact: true,
    })
    .check();
  await ui
    .getByRole("checkbox", { name: "Production rollout", exact: true })
    .check();
  await expect(
    ui.getByText("All launch requirements complete", { exact: true }),
  ).toBeVisible();
  await ui
    .getByRole("button", { name: "Reset checklist", exact: true })
    .click();
  await expect(
    ui.getByText("0 of 4 tasks completed", { exact: true }),
  ).toBeVisible();
  const firstImage = ui.getByRole("img", {
    name: /^architectural photography/,
  });
  await firstImage.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      firstImage.evaluate((image) =>
        image instanceof HTMLImageElement ? image.naturalWidth : 0,
      ),
    )
    .toBeGreaterThan(0);
  await ui.getByRole("button", { name: "Next slide", exact: true }).click();
  const secondImage = ui.getByRole("img", { name: /^macro photography/ });
  await expect
    .poll(() =>
      secondImage.evaluate((image) =>
        image instanceof HTMLImageElement ? image.naturalWidth : 0,
      ),
    )
    .toBeGreaterThan(0);
  await ui
    .getByRole("checkbox", { name: "Show operational metrics", exact: true })
    .uncheck();
  await expect(ui.getByRole("heading", { name: "99.99%" })).toHaveCount(0);
  await ui
    .getByRole("checkbox", { name: "Show operational metrics", exact: true })
    .check();
  await expect(ui.getByRole("heading", { name: "99.99%" })).toBeVisible();
  await expect(
    ui.getByRole("heading", { name: "Workspace preferences", exact: true }),
  ).toBeVisible();
  await ui
    .getByRole("checkbox", { name: "Show activity details", exact: true })
    .uncheck();
  await expect(
    ui.getByText("feature/dashboard-ui → main", { exact: true }),
  ).toHaveCount(0);
  await ui
    .getByRole("checkbox", { name: "Show activity details", exact: true })
    .check();
  await ui.getByRole("button", { name: "Show popover" }).click();
  await expect(
    ui.getByText("Contextual popover", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(ui.getByText("Contextual popover", { exact: true })).toHaveCount(
    0,
  );
  await ui
    .getByRole("textbox", { name: "Code editor", exact: true })
    .fill("const edited = true;");
  await expect(
    ui.getByRole("textbox", { name: "Code editor", exact: true }),
  ).toHaveValue("const edited = true;");
  await ui
    .getByRole("button", { name: "Copy all settings", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('"displayName": "Felix"');
  expect(errors).toEqual([]);
  await page.screenshot({ path: "/tmp/dil-showcase.png", fullPage: true });
});

test("renders the showcase on mobile and handles an image failure locally", async ({
  page,
}) => {
  const ui = dilPage(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openShowcase(page);
  await expect(ui.locator('[data-complete="true"]')).toBeAttached();
  await ui
    .getByRole("heading", { name: "Image gallery" })
    .scrollIntoViewIfNeeded();
  await page.frames()[1]?.evaluate(() => {
    const image = document.querySelector("img");
    if (image) image.src = "data:image/jpeg;base64,invalid";
  });
  await expect(
    ui.getByText("Image unavailable", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await ui.getByRole("button", { name: "Show popover", exact: true }).click();
  await expect(
    ui.getByText("Contextual popover", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
  await page.screenshot({ path: "/tmp/dil-mobile.png", fullPage: true });
});

test("keeps controls usable as later declarations and content arrive", async ({
  page,
}) => {
  const ui = dilPage(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openShowcase(page, "?benchmark=1");
  await expect(ui.locator('[data-complete="true"]')).toBeAttached();
  await ui.getByRole("button", { name: "Replay stream" }).click();
  await expect(ui.locator('[data-complete="false"]')).toBeAttached();
  await expect(
    ui.getByRole("slider", { name: "Annual growth assumption" }),
  ).toBeEnabled();
  await ui.getByRole("slider", { name: "Annual growth assumption" }).focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(
    ui.getByRole("slider", { name: "Annual growth assumption" }),
  ).toHaveAttribute("aria-valuenow", "-18");
  await ui.getByRole("button", { name: "Pause", exact: true }).click();
  const before = await ui
    .locator("[data-scanned]")
    .getAttribute("data-scanned");
  await ui.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(ui.locator('[data-complete="true"]')).toBeAttached();
  await expect(
    ui.getByRole("slider", { name: "Annual growth assumption" }),
  ).toHaveAttribute("aria-valuenow", "-18");
  expect(Number(before)).toBeLessThan(25195);
  await expect(ui.locator('.dil-document [role="alert"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
