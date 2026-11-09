import { expect, test } from "@playwright/test";
import { openShowcase } from "./site-demo-page";

/* customization.spec.ts, run against the Next.js playground with URLs relative to SITE_BASE_PATH. */

for (const mode of ["Host DOM", "Shadow DOM"] as const) {
  test(`${mode} custom components receive configuration, actions, styles, and independent state`, async ({
    page,
  }) => {
    await page.goto("demo/customization/");
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
    // Monaco's live regions and Next.js's route announcer are alerts too; scope to the preview.
    const alerts = page.locator(".od-hero-output").getByRole("alert");
    await expect(alerts).toContainText("Custom component failed");
    await page.getByRole("button", { name: "Increment host neighbor" }).click();
    await expect(
      page.getByText("Host neighbor count: 2", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Restore component" }).click();
    await expect(alerts).toHaveCount(0);
  });
  test(`${mode} stock widgets render with injected host primitives`, async ({
    page,
  }) => {
    await page.goto("demo/customization/");
    await page
      .getByRole("button", { name: "Demo settings", exact: true })
      .click();
    await page.getByRole("radio", { name: mode, exact: true }).click();
    await page.keyboard.press("Escape");
    // Locators pierce open shadow roots, so one scenario covers both modes.
    const demo = page.locator('[data-demo="host-primitives"]');
    const reset = demo.getByRole("button", { name: "Reset period" });
    await expect(reset).toHaveAttribute("data-host-primitive", "button");
    // Host styles reach the ShadowRoot through shadowStyles; the accent is a
    // custom property inherited from the page across the boundary.
    await expect(reset).toHaveCSS("background-color", "rgb(21, 111, 85)");
    await expect(reset).toHaveCSS("border-radius", "2px");
    const inShadow = await reset.evaluate(
      (element) => element.getRootNode() instanceof ShadowRoot,
    );
    expect(inShadow).toBe(mode === "Shadow DOM");

    // Roving focus inside the host toggle group, with OpenDIL's state binding.
    const week = demo.getByRole("radio", { name: "Week" });
    const month = demo.getByRole("radio", { name: "Month" });
    await expect(week).toHaveAttribute("data-host-primitive", "toggle-item");
    await expect(week).toHaveAttribute("data-state", "on");
    await reset.focus();
    await page.keyboard.press("Tab");
    await expect(week).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(month).toBeFocused();
    await page.keyboard.press("Space");
    await expect(month).toHaveAttribute("data-state", "on");
    await expect(
      demo.getByText("Period: month", { exact: true }),
    ).toBeVisible();
    await reset.click();
    await expect(demo.getByText("Period: week", { exact: true })).toBeVisible();

    const reviewed = demo.getByRole("checkbox", { name: "Reviewed" });
    await expect(reviewed).toHaveAttribute("data-host-primitive", "checkbox");
    await reviewed.click();
    await expect(reviewed).toHaveAttribute("data-state", "checked");

    // The host popover portals into the renderer's own scope.
    const open = demo.getByRole("button", { name: "Open details" });
    await expect(open).toHaveAttribute("data-variant", "outline");
    await open.click();
    const content = demo.getByText("Details from the host popover");
    await expect(content).toBeVisible();
    const placement = await content.evaluate((element) => ({
      portal: element.closest("[data-dil-portals]") !== null,
      scope: element.closest(".dil-scope") !== null,
      host: element
        .closest("[data-host-primitive]")
        ?.getAttribute("data-host-primitive"),
      shadow: element.getRootNode() instanceof ShadowRoot,
    }));
    expect(placement).toEqual({
      portal: true,
      scope: true,
      host: "popover",
      shadow: mode === "Shadow DOM",
    });
    await expect(demo.locator(".demo-ds-popover")).toHaveCSS(
      "border-top-color",
      "rgb(21, 111, 85)",
    );
    await page.keyboard.press("Escape");
    await expect(content).toBeHidden();
    await expect(open).toBeFocused();
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

test("customization docs run registered components, themes and named slots", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("docs/custom-components/");
  const componentDemo = page.locator('[data-customization-demo="components"]');
  await componentDemo.scrollIntoViewIfNeeded();
  const shadow = componentDemo.locator('[data-dil-mode="shadow"]');
  await shadow
    .getByRole("button", { name: "Custom increment", exact: true })
    .click();
  await expect(
    shadow.getByText("Custom count: 1", { exact: true }),
  ).toBeVisible();
  const disabled = shadow.getByRole("checkbox", {
    name: "Disable custom action",
    exact: true,
  });
  await disabled.check();
  await expect(
    shadow.getByRole("button", { name: "Custom increment", exact: true }),
  ).toBeDisabled();
  await disabled.uncheck();
  // Scrolling the playground out of view and back keeps its document state.
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await componentDemo.scrollIntoViewIfNeeded();
  await expect(
    shadow.getByText("Custom count: 1", { exact: true }),
  ).toBeVisible();
  await componentDemo
    .getByRole("radio", { name: "Host DOM", exact: true })
    .click();
  const host = componentDemo.locator('[data-dil-mode="host"]');
  await expect(
    host.getByText("Custom count: 0", { exact: true }),
  ).toBeVisible();
  await host
    .getByRole("button", { name: "Custom increment", exact: true })
    .click();
  await expect(
    host.getByText("Custom count: 1", { exact: true }),
  ).toBeVisible();

  await page.goto("docs/theming/");
  const stylingDemo = page.locator('[data-customization-demo="styling"]');
  await stylingDemo.scrollIntoViewIfNeeded();
  const styled = stylingDemo.locator('[data-dil-mode="shadow"]');
  await styled
    .getByRole("button", { name: "Custom increment", exact: true })
    .click();
  await expect(
    styled.getByText("Custom count: 1", { exact: true }),
  ).toBeVisible();
  const styledDocument = await styled
    .locator("[data-dil-document]")
    .elementHandle();
  await stylingDemo.getByRole("radio", { name: "Violet", exact: true }).click();
  // The accent line is the callout's ::before, inset from its rounded border.
  await expect
    .poll(() =>
      styled
        .getByLabel("Custom callout", { exact: true })
        .evaluate(
          (callout) => getComputedStyle(callout, "::before").backgroundColor,
        ),
    )
    .toBe("rgb(94, 76, 255)");
  await stylingDemo
    .getByRole("radiogroup", { name: "Preview theme" })
    .getByRole("radio", { name: "Dark", exact: true })
    .click();
  await expect(styled.locator(".dil-scope")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await expect(
    styled.getByText("Custom count: 1", { exact: true }),
  ).toBeVisible();
  // New customization objects restyle the same document; it never remounts.
  expect(await styledDocument?.evaluate((element) => element.isConnected)).toBe(
    true,
  );
  await testInfo.attach("live-customization-theme", {
    body: await stylingDemo.screenshot(),
    contentType: "image/png",
  });

  await page.goto("docs/custom-components/");
  const configDemo = page.locator('[data-customization-demo="configuration"]');
  await configDemo.scrollIntoViewIfNeeded();
  const configured = configDemo.locator('[data-dil-mode="shadow"]');
  await configured
    .getByRole("button", { name: "Custom increment", exact: true })
    .click();
  await configDemo
    .getByRole("textbox", { name: "Callout label", exact: true })
    .fill("Deployment");
  await configDemo
    .getByRole("radio", { name: "Prominent", exact: true })
    .click();
  await expect(configured.getByText("Deployment", { exact: true })).toHaveCSS(
    "font-size",
    "18px",
  );
  await expect(
    configured.getByText("Custom count: 1", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 375, height: 950 });
  // Crossing a breakpoint transitions the off-canvas sidebar; measure the settled layout.
  await page.evaluate(() =>
    Promise.allSettled(
      document.getAnimations().map((animation) => animation.finished),
    ),
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await testInfo.attach("live-customization-mobile", {
    body: await configDemo.screenshot(),
    contentType: "image/png",
  });
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(errors).toEqual([]);
});
