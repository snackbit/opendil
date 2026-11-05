import { expect, test } from "@playwright/test";
import {
  paneScrollsAfterWheel,
  replaceSource,
  watchPaneScrollsAfterWheel,
} from "./site-demo-page";

test("settings remain scrollable when opened near the bottom of the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.goto("./");
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
  await page.goto("./");
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
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
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
  await page.goto("./");
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
    await page.goto("./");
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
      .getByRole("button", { name: /^Switch to (dark|light) theme$/ })
      .boundingBox();
    if (!themeButton) throw new Error("Theme button is missing");
    expect(themeButton.y).toBeGreaterThanOrEqual(0);
    expect(themeButton.y + themeButton.height).toBeLessThanOrEqual(64);
    const theme = await page.locator("html").getAttribute("data-theme");
    await page.mouse.click(
      themeButton.x + themeButton.width / 2,
      themeButton.y + themeButton.height / 2,
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      theme === "dark" ? "light" : "dark",
    );
    expect(await geometry()).toEqual(beforeTheme);
  }
});
test("the landing preview follows its own pane and yields immediately to the wheel", async ({
  page,
}) => {
  await watchPaneScrollsAfterWheel(page);
  await page.goto("./");
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
  // The first wheel stops following: from then on the page never scrolls the pane itself.
  // Chrome animates wheel scrolls, and scroll anchoring can shift the pane while the answer
  // still streams, so one wheel may stop a few pixels short of the top. Wheel like a reader
  // would until the pane reaches it.
  await expect
    .poll(async () => {
      await page.mouse.wheel(0, -10000);
      return pane.evaluate((element) => element.scrollTop);
    })
    .toBe(0);
  expect(await paneScrollsAfterWheel(page)).toBe(0);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(pane.locator(".recharts-line").first()).toBeVisible();
  expect(await paneScrollsAfterWheel(page)).toBe(0);
  await expect
    .poll(() => pane.evaluate((element) => element.scrollTop))
    .toBe(0);
});
test.describe("on a narrow touch screen", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("the landing preview streams, replays and leaves vertical scrolling to the page", async ({
    page,
  }) => {
    await page.goto("./");
    const demo = page.locator(".od-hero-workbench");
    await demo.scrollIntoViewIfNeeded();
    const progress = page.getByRole("progressbar", {
      name: "Demo source received",
    });
    const received = async () =>
      Number(await progress.getAttribute("aria-valuenow"));
    await expect.poll(received).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await expect.poll(received).toBe(100);
    await page.getByRole("button", { name: "Replay", exact: true }).click();
    await expect.poll(received).toBeLessThan(100);
    const restarted = await received();
    await expect.poll(received).toBeGreaterThan(restarted);
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    const output = page.getByLabel("Streaming preview", { exact: true });
    await expect(
      output.locator(".recharts-bar-rectangle").first(),
    ).toBeVisible();
    // The preview grows with its content instead of trapping swipes in its own scroller.
    expect(
      await output.evaluate(
        (element) => element.scrollHeight - element.clientHeight,
      ),
    ).toBeLessThanOrEqual(1);
    // Touches over the source reach the page until a tap unlocks the editor.
    const code = page.locator(".od-hero-code");
    await code.scrollIntoViewIfNeeded();
    const editorReceivesTouches = () =>
      code.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2,
        );
        return Boolean(hit?.closest(".monaco-editor"));
      });
    expect(await editorReceivesTouches()).toBe(false);
    await expect(code.getByText("Tap to scroll code")).toBeVisible();
    await code.tap();
    expect(await editorReceivesTouches()).toBe(true);
    await expect(code.getByText("Tap to scroll code")).toBeHidden();
    await output.tap({ position: { x: 8, y: 8 } });
    expect(await editorReceivesTouches()).toBe(false);
  });
});
test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("the prerendered landing shows the example source instead of the renderer", async ({
    page,
  }) => {
    await page.goto("./");
    await expect(
      page.getByRole("heading", { level: 1, name: /Generative interfaces/ }),
    ).toBeVisible();
    const fallback = page.locator(".od-hero-demo-fallback");
    await expect(fallback.locator("pre")).toContainText("Team members");
    await expect(fallback).toContainText("Loading the live renderer…");
    await expect(page.locator("[data-dil-mode]")).toHaveCount(0);
    for (const id of ["charts", "pricing", "graph"])
      await expect(
        page.locator(`.od-example-card[href$="/demo/${id}/"]`),
      ).toBeVisible();
  });
});
test("landing links to a working editable example and searchable documentation", async ({
  page,
}) => {
  const frameRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/frame.js"))
      frameRequests.push(request.url());
  });
  // A preference stored under the retired key must not switch the site to iframes.
  await page.addInitScript(() => {
    if (window !== window.top) return;
    sessionStorage.setItem(
      "opendil:renderer-preferences",
      '{"mode":"isolated","reveal":false}',
    );
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", {
      name: "Generative interfaces For your agents",
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
  const editor = page.getByRole("textbox", { name: "DIL source", exact: true });
  await expect(editor).toBeVisible();
  await replaceSource(
    page,
    editor,
    "<box border padding={4}><title>Hello from the workbench</title></box>",
  );
  await expect(
    page
      .locator('[data-dil-mode="shadow"]')
      .getByRole("heading", { name: "Hello from the workbench", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Docs", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Introduction", exact: true }),
  ).toBeVisible();
  await page.locator(".od-live-example").first().scrollIntoViewIfNeeded();
  await expect(
    page
      .locator('.od-live-example [data-dil-mode="shadow"]')
      .getByRole("heading", { name: "Make yourself at home.", exact: true }),
  ).toBeVisible();
  await page
    .locator("#nd-sidebar")
    .getByRole("link", { name: "Quickstart", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Quickstart", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("npm install @snackbit/opendil", { exact: false }).first(),
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
    for (const route of ["./", "demo/deployment/", "docs/getting-started/"]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      if (route === "./") {
        await page.getByRole("button", { name: "Finish", exact: true }).click();
        await expect(
          page
            .locator('.od-hero-output [data-dil-mode="shadow"]')
            .locator(".recharts-bar-rectangle")
            .first(),
        ).toBeVisible();
        expect(
          await page.locator(".od-hero-code").evaluate((element) => {
            const editor = element.querySelector(".monaco-scrollable-element");
            return editor
              ? editor.getBoundingClientRect().height <= element.clientHeight
              : false;
          }),
        ).toBe(true);
      }
      if (route.startsWith("demo/")) {
        await expect(
          page.getByRole("textbox", { name: "DIL source", exact: true }),
        ).toBeVisible();
        await expect(
          page
            .locator('[data-dil-mode="shadow"]')
            .getByRole("button", { name: "Deploy application", exact: true }),
        ).toBeAttached();
      }
      // Soft, so one run reports every route and width that overflows.
      expect
        .soft(
          await page.evaluate(() => document.documentElement.scrollWidth),
          `${route} at ${width}px`,
        )
        .toBeLessThanOrEqual(width);
      if (width === 375 || width === 1440) {
        if (route === "./") {
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
        const name = route === "./" ? "home" : route.replaceAll("/", "-");
        await testInfo.attach(`${name}-${width}`, {
          body: await page.screenshot({
            fullPage: true,
            animations: "disabled",
          }),
          contentType: "image/png",
        });
      }
    }
  }
  expect(errors).toEqual([]);
});
