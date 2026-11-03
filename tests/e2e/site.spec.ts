import { expect, test } from "@playwright/test";
test("landing links to a working editable example and searchable documentation", async ({
  page,
}) => {
  const frameRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/frame.js"))
      frameRequests.push(request.url());
  });
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "opendil:renderer-preferences",
      '{"mode":"isolated","reveal":false}',
    );
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Generate interfaces. Keep control.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.locator('.od-hero-output [data-dil-mode="shadow"]'),
  ).toBeAttached();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const installation = page.getByLabel("Install OpenDIL", { exact: true });
  await installation
    .getByRole("button", { name: "Copy code", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(
      "npm install @snackbit/opendil react react-dom\nnpx opendil copy-assets --out public/opendil",
    );
  await page
    .getByRole("link", { name: "Open playground", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("textbox", { name: "DIL source", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "DIL source", exact: true })
    .fill(
      "<box border padding={4}><title>Hello from the workbench</title></box>",
    );
  await expect(
    page
      .locator('[data-dil-mode="shadow"]')
      .getByRole("heading", { name: "Hello from the workbench", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Docs", exact: true }).first().click();
  await expect(
    page.getByRole("heading", { name: "Getting started", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByText("npm install @snackbit/opendil react react-dom", {
        exact: false,
      })
      .first(),
  ).toBeVisible();
  await page.locator(".od-live-example").scrollIntoViewIfNeeded();
  await expect(
    page
      .locator('.od-live-example [data-dil-mode="shadow"]')
      .getByRole("heading", { name: "Make yourself at home.", exact: true }),
  ).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(frameRequests).toEqual([]);
});
test("site pages fit narrow and wide layouts with independent output styling", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ["/", "/demo/deployment/", "/docs/getting-started/"]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      if (route === "/") {
        await page.getByRole("button", { name: "Finish", exact: true }).click();
        await expect(
          page
            .locator('.od-hero-output [data-dil-mode="shadow"]')
            .locator(".recharts-bar-rectangle")
            .first(),
        ).toBeVisible();
        expect(
          await page.locator(".od-hero-code").evaluate((element) => {
            const editor = element.querySelector(".cm-scroller");
            return editor
              ? editor.getBoundingClientRect().height <= element.clientHeight
              : false;
          }),
        ).toBe(true);
      }
      if (route.includes("demo"))
        await expect(
          page.getByRole("textbox", { name: "DIL source", exact: true }),
        ).toBeVisible();
      if (route.includes("demo") && width < 768)
        await page.getByRole("radio", { name: "Preview", exact: true }).click();
      if (route.includes("demo"))
        await expect(
          page
            .locator('[data-dil-mode="shadow"]')
            .getByRole("button", { name: "Deploy application", exact: true }),
        ).toBeAttached();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      if (width === 375 || width === 1440) {
        if (route === "/") {
          for (const image of await page
            .locator(".od-example-card img")
            .all()) {
            await image.scrollIntoViewIfNeeded();
            await image.evaluate((element) => {
              if (element instanceof HTMLImageElement) return element.decode();
            });
          }
          await page.evaluate(() => window.scrollTo(0, 0));
        }
        await testInfo.attach(
          `${route.replaceAll("/", "-") || "home"}-${width}`,
          {
            body: await page.screenshot({
              fullPage: true,
              animations: "disabled",
            }),
            contentType: "image/png",
          },
        );
      }
    }
  }
  expect(errors).toEqual([]);
});
test("documentation search opens real indexed results and themes persist across pages", async ({
  page,
}) => {
  await page.goto("/docs/getting-started/");
  await page.getByRole("button", { name: /Appearance:/ }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const search = page.getByRole("dialog").getByRole("textbox");
  await search.fill("Shadow DOM");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("link", { name: /Isolation/ })
      .first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Demo", exact: true }).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("textbox", { name: "DIL source", exact: true }),
  ).toBeVisible();
});

test("customization docs run registered components, themes and named slots", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/docs/customization/components/");
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

  await page.goto("/docs/customization/styling/");
  const stylingDemo = page.locator('[data-customization-demo="styling"]');
  await stylingDemo.scrollIntoViewIfNeeded();
  const styled = stylingDemo.locator('[data-dil-mode="shadow"]');
  await styled
    .getByRole("button", { name: "Custom increment", exact: true })
    .click();
  await stylingDemo.getByRole("radio", { name: "Violet", exact: true }).click();
  await expect(styled.getByLabel("Custom callout", { exact: true })).toHaveCSS(
    "border-left-color",
    "rgb(94, 76, 255)",
  );
  await stylingDemo
    .getByRole("button", { name: "Dark preview", exact: true })
    .click();
  await expect(styled.locator(".dil-scope")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await expect(
    styled.getByText("Custom count: 1", { exact: true }),
  ).toBeVisible();
  await testInfo.attach("live-customization-theme", {
    body: await stylingDemo.screenshot(),
    contentType: "image/png",
  });

  await page.goto("/docs/customization/configuration/");
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
