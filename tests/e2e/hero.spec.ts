import { expect, test } from "@playwright/test";
test("settings remain scrollable when opened near the bottom of the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Demo settings" });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.evaluate((element) =>
    window.scrollBy(
      0,
      element.getBoundingClientRect().top - (window.innerHeight - 55),
    ),
  );
  await trigger.click();
  const settings = page.locator('[data-slot="popover-content"]');
  await expect(
    settings.getByRole("heading", { name: "Demo settings" }),
  ).toBeVisible();
  const bounds = await settings.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(600);
  await settings
    .getByRole("spinbutton", { name: "Scroll ahead (px)" })
    .scrollIntoViewIfNeeded();
  await expect(
    settings.getByRole("spinbutton", { name: "Scroll ahead (px)" }),
  ).toBeVisible();
});
test("landing preview renders the real document and its controls work", async ({
  page,
}, testInfo) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("requestfailed", (request) =>
    failures.push(request.url() + ": " + request.failure()?.errorText),
  );
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(message.text());
  });
  await page.goto(process.env.DIL_HERO_URL ?? "/");
  await page.locator(".od-hero-preview").scrollIntoViewIfNeeded();
  const preview = page.locator('.od-hero-output [data-dil-mode="shadow"]');
  try {
    await expect(
      preview.getByRole("slider", { name: "Team members", exact: true }),
    ).toBeVisible();
  } catch (error) {
    console.log(
      "Hero diagnostic",
      JSON.stringify({
        failures,
        frames: page.frames().map((frame) => frame.url()),
        content: await page.locator(".od-hero-output").innerText(),
      }),
    );
    throw error;
  }
  const initial = await page.locator(".od-stream-demo").boundingBox();
  await expect(page.locator(".od-stream-demo")).toHaveCSS(
    "border-radius",
    "12px",
  );
  await expect(page.locator(".od-code-upcoming").first()).toBeVisible();
  await expect
    .poll(() =>
      preview
        .getByRole("slider", { name: "Team members", exact: true })
        .evaluate((element) => element.closest("[inert]") === null),
    )
    .toBe(true);
  await preview
    .getByRole("slider", { name: "Team members", exact: true })
    .focus();
  await page.keyboard.press("End");
  await expect(preview.getByText("€870.00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(
    preview.locator(".recharts-bar-rectangle").first(),
  ).toBeVisible();
  await expect(page.locator(".od-code-upcoming")).toHaveCount(0);
  expect((await page.locator(".od-stream-demo").boundingBox())?.height).toBe(
    initial?.height,
  );
  await expect(page.locator(".od-demo-rate")).toHaveText("150 tok/s");
  const rate = page.getByRole("slider", {
    name: "Animation speed",
    exact: true,
  });
  await rate.press("Home");
  await expect(page.locator(".od-demo-rate")).toHaveText("1 tok/s");
  await rate.press("End");
  await expect(page.locator(".od-demo-rate")).toHaveText("1000 tok/s");
  await page.getByRole("button", { name: "Demo settings" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Progressive reveal" }),
  ).toBeChecked();
  await page.getByRole("radio", { name: "Shadow DOM", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Appearance:/ }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(preview.locator(".dil-scope")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await expect(preview.getByText("€870.00", { exact: true })).toBeVisible();
  await testInfo.attach("live-hero", {
    body: await page.locator(".od-preview-frame").screenshot(),
    contentType: "image/png",
  });
  expect(failures).toEqual([]);
});
test("landing example selector changes real content and keeps the chosen rate", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".od-stream-demo").scrollIntoViewIfNeeded();
  await page
    .getByRole("slider", { name: "Animation speed", exact: true })
    .press("End");
  await page
    .getByRole("combobox", { name: "Demo example", exact: true })
    .click();
  await expect(page.getByRole("option")).toHaveCount(4);
  await page.getByRole("option", { name: /release-planner\.dil/ }).click();
  await expect(page.locator(".od-demo-rate")).toHaveText("1000 tok/s");
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  const output = page.locator(".od-hero-output");
  await expect(
    output.getByRole("heading", { name: "API gateway", exact: true }),
  ).toBeVisible();
  await output
    .getByRole("checkbox", {
      name: "I have reviewed the rollout and rollback plan",
    })
    .check();
  await output
    .getByRole("button", { name: "Deploy release", exact: true })
    .click();
  await expect(output.getByText("Deployed", { exact: true })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Demo example", exact: true })
    .click();
  await page.getByRole("option", { name: /service-console\.dil/ }).click();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(output.locator('[data-chart-type="line"]')).toBeVisible();
  await output.getByRole("radio", { name: "Topology", exact: true }).click();
  await expect(output.locator(".react-flow__node").first()).toBeVisible();
  await page
    .getByRole("combobox", { name: "Demo example", exact: true })
    .click();
  await page.getByRole("option", { name: /showcase\.dil/ }).click();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(
    output.getByRole("heading", { name: "Interactive workspace", exact: true }),
  ).toBeVisible();
  for (const heading of [
    "Analytics",
    "Workspace pricing",
    "Charts",
    "Service topology",
    "Launch checklist",
    "Image gallery",
    "Service health",
    "Activity and preferences",
    "Actions and code",
  ])
    await expect(
      output.getByRole("heading", { name: heading, exact: true }),
    ).toBeAttached();
  await expect(output.locator(".react-flow__node")).toHaveCount(5);
  await page.getByLabel("Streaming preview", { exact: true }).hover();
  await page.mouse.wheel(0, -10000);
  const search = output.getByRole("textbox", {
    name: "Find a service",
    exact: true,
  });
  await search.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      search.evaluate((element) => element.closest("[inert]") === null),
    )
    .toBe(true);
  await search.fill("payments");
  await expect(
    output.getByText("1 / 8 services", { exact: true }),
  ).toBeVisible();
  await expect(
    output.getByRole("cell", { name: "api-gateway", exact: true }),
  ).toHaveCount(0);
  await output
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(
    output.getByText("8 / 8 services", { exact: true }),
  ).toBeVisible();
  await expect(
    output.getByRole("checkbox", {
      name: "Show activity details",
      exact: true,
    }),
  ).toBeAttached();
  await expect(output.getByRole("alert")).toHaveCount(0);
});
test("menus preserve the root scrollbar and the shared page alignment", async ({
  page,
}, testInfo) => {
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await page.locator(".od-stream-demo").scrollIntoViewIfNeeded();
    const geometry = () =>
      page.evaluate(() => {
        const header = document
          .querySelector(".od-header")
          ?.getBoundingClientRect();
        const content = document
          .querySelector(".od-hero")
          ?.getBoundingClientRect();
        return {
          width: document.documentElement.clientWidth,
          y: scrollY,
          headerLeft: header?.left,
          headerTop: header?.top,
          headerWidth: header?.width,
          contentLeft: content?.left,
          contentWidth: content?.width,
          overflow: getComputedStyle(document.documentElement).overflowY,
        };
      });
    const before = await geometry();
    expect(before.headerLeft).toBe(before.contentLeft);
    expect(before.headerWidth).toBe(before.contentWidth);
    expect(before.overflow).toBe("scroll");
    await page
      .getByRole("combobox", { name: "Demo example", exact: true })
      .click();
    await expect(page.getByRole("option")).toHaveCount(4);
    expect(await geometry()).toEqual(before);
    await testInfo.attach("compact-menu-" + width, {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    await page.keyboard.press("Escape");
    await expect(page.locator("body")).not.toHaveAttribute(
      "data-scroll-locked",
      /.+/,
    );
    expect(await geometry()).toEqual(before);
    const beforeTheme = await geometry();
    // A real pointer click avoids Playwright scrolling a sticky descendant to its flow position.
    const themeButton = await page
      .getByRole("button", { name: /Appearance:/ })
      .boundingBox();
    if (!themeButton) throw new Error("Theme button is missing");
    expect(themeButton.y).toBeGreaterThanOrEqual(0);
    expect(themeButton.y + themeButton.height).toBeLessThanOrEqual(64);
    await page.mouse.click(
      themeButton.x + themeButton.width / 2,
      themeButton.y + themeButton.height / 2,
    );
    await expect(
      page.getByRole("menuitemradio", { name: "Dark", exact: true }),
    ).toBeVisible();
    expect(await geometry()).toEqual(beforeTheme);
    await page.keyboard.press("Escape");
  }
});
test("the landing preview follows its own pane and yields immediately to the wheel", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".od-stream-demo").scrollIntoViewIfNeeded();
  await page
    .getByRole("combobox", { name: "Demo example", exact: true })
    .click();
  await page.getByRole("option", { name: /service-console\.dil/ }).click();
  const pane = page.getByLabel("Streaming preview", { exact: true });
  const pageOffset = await page.evaluate(() => scrollY);
  await expect
    .poll(() => pane.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => scrollY)).toBe(pageOffset);
  await pane.hover();
  await page.mouse.wheel(0, -10000);
  await expect
    .poll(() => pane.evaluate((element) => element.scrollTop))
    .toBe(0);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(pane.locator(".recharts-line").first()).toBeVisible();
  await expect
    .poll(() => pane.evaluate((element) => element.scrollTop))
    .toBe(0);
});
