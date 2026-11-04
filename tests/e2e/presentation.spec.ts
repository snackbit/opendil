import { expect, test } from "@playwright/test";
import { dilPage, openShowcase } from "./dil-page";

test("donut legends describe categories without changing their proportions", async ({
  page,
}) => {
  await openShowcase(page);
  const chart = dilPage(page).locator('[data-chart-type="pie"]');
  await expect(chart.locator(".recharts-sector")).toHaveCount(4);
  await chart.getByText("Organic", { exact: true }).click();
  await expect(chart.locator(".recharts-sector")).toHaveCount(4);
  await expect(chart.getByRole("button")).toHaveCount(0);
});

test("popover content inherits renderer typography and remains a styled overlay", async ({
  page,
}) => {
  await openShowcase(page);
  const ui = dilPage(page);
  await ui.getByRole("button", { name: "Show popover", exact: true }).click();
  const popup = ui.locator('[data-slot="popover-content"]');
  await expect(popup).toContainText("Contextual popover");
  await expect(popup).toHaveCSS("border-top-style", "solid");
  const font = await popup.evaluate(
    (element) => getComputedStyle(element).fontFamily,
  );
  expect(font).not.toMatch(/Times/);
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
});
test("scatter hover snaps from empty plot space to the nearest datum", async ({
  page,
}, testInfo) => {
  await openShowcase(page);
  const ui = dilPage(page);
  const chart = ui.locator('[data-chart-type="scatter"]');
  const plot = chart.locator("[data-chart-hit-area]");
  await plot.scrollIntoViewIfNeeded();
  const box = await plot.boundingBox();
  if (!box) throw new Error("Missing plot area");
  await plot.hover({ position: { x: box.width * 0.78, y: box.height * 0.77 } });
  await expect(chart.locator('[data-chart-snapped-index="6"]')).toBeAttached();
  const tooltip = ui.getByRole("tooltip");
  await expect(tooltip).toContainText("95");
  await expect(tooltip).toContainText("530");
  await testInfo.attach("scatter-snap", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});

test("demo settings expose reveal state and timing without restarting the document", async ({
  page,
}) => {
  await openShowcase(page);
  const ui = dilPage(page);
  const input = ui.getByRole("textbox", { name: "Display name" });
  await input.click();
  await input.fill("Keep this name");
  await page
    .getByRole("button", { name: "Demo settings", exact: true })
    .click();
  const toggle = page.getByRole("checkbox", {
    name: "Progressive reveal",
    exact: true,
  });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(
    page.getByRole("spinbutton", { name: "Reveal step delay (ms)" }),
  ).toHaveValue("100");
  await expect(
    page.getByRole("spinbutton", { name: "Fade duration (ms)" }),
  ).toHaveValue("220");
  await page
    .getByRole("spinbutton", { name: "Reveal step delay (ms)" })
    .fill("80");
  await page
    .getByRole("spinbutton", { name: "Fade duration (ms)" })
    .fill("240");
  await page.keyboard.press("Escape");
  await expect(input).toHaveValue("Keep this name");
  await page
    .getByRole("button", { name: "Demo settings", exact: true })
    .click();
  await expect(
    page.getByRole("spinbutton", { name: "Reveal step delay (ms)" }),
  ).toHaveValue("80");
  await page.keyboard.press("Escape");
});
test("code blocks edit directly, wrap without losing drafts, and copy through the broker", async ({
  page,
  context,
}, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openShowcase(page);
  const ui = dilPage(page);
  const editor = ui.getByRole("textbox", { name: "Code editor", exact: true });
  const codeHighlight = ui.locator(".dil-code-highlight");
  await expect(codeHighlight.locator(".hljs-keyword").first()).toBeVisible();
  const metrics = await ui.locator(".dil-code-block").evaluate((element) => {
    const textarea = element.querySelector("textarea"),
      code = element.querySelector(".dil-code-highlight code");
    if (!textarea || !code) throw new Error("Missing editor layers");
    const properties = (node: Element) => {
      const css = getComputedStyle(node);
      return {
        family: css.fontFamily,
        size: css.fontSize,
        lineHeight: css.lineHeight,
        spacing: css.letterSpacing,
        weight: css.fontWeight,
      };
    };
    return { input: properties(textarea), highlight: properties(code) };
  });
  expect(metrics.highlight).toEqual(metrics.input);
  await editor.press("ControlOrMeta+a");
  await testInfo.attach("highlighted-editor-selection", {
    body: await ui.locator(".dil-code-block").screenshot(),
    contentType: "image/png",
  });
  await testInfo.attach("highlighted-typescript-editor", {
    body: await ui.locator(".dil-code-block").screenshot(),
    contentType: "image/png",
  });
  await expect(
    ui.getByRole("button", { name: "Edit code", exact: true }),
  ).toHaveCount(0);
  await editor.fill("const edited = true;");
  await expect(codeHighlight).toContainText("const edited = true;");
  await expect(codeHighlight.locator(".hljs-keyword")).toContainText("const");
  const ink = await codeHighlight
    .locator(".hljs-keyword")
    .evaluate((element) => getComputedStyle(element).color);
  expect(ink).not.toBe(
    await codeHighlight.evaluate((element) => getComputedStyle(element).color),
  );
  await editor.evaluate((element) => {
    if (element instanceof HTMLTextAreaElement) element.setSelectionRange(3, 8);
  });
  const block = ui.locator(".dil-code-block");
  await block.getByRole("button", { name: "Word wrap", exact: true }).hover();
  await expect(ui.locator(".dil-tooltip")).toContainText("Enable word wrap");
  await page.keyboard.press("Escape");
  await block.getByRole("button", { name: "Word wrap", exact: true }).click();
  await expect(editor).toHaveAttribute("wrap", "soft");
  await expect(editor).toHaveValue("const edited = true;");
  expect(
    await editor.evaluate((element) =>
      element instanceof HTMLTextAreaElement
        ? [element.selectionStart, element.selectionEnd]
        : [],
    ),
  ).toEqual([3, 8]);
  await block.getByRole("button", { name: "Copy code", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("const edited = true;");
  await expect(block.getByRole("status")).toContainText("Code copied");
});

test("code copy reports a clipboard denial through the isolated broker", async ({
  page,
}) => {
  // Replace only the browser clipboard boundary; retain the real frame, channel, and broker.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: () =>
          Promise.reject(new DOMException("Denied", "NotAllowedError")),
      },
    });
  });
  await openShowcase(page);
  const block = dilPage(page).locator(".dil-code-block");
  await block.getByRole("button", { name: "Copy code", exact: true }).click();
  await expect(block.getByRole("alert")).toContainText("Could not copy code");
});

test("stream following survives growth, pauses for reading, and resumes at the tail", async ({
  page,
}) => {
  await openShowcase(page, "?benchmark=1");
  const ui = dilPage(page);
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  await expect(
    ui.getByRole("heading", { name: "Configure your workspace", exact: true }),
  ).toBeAttached();
  await expect(
    page.getByRole("button", { name: "Jump to latest", exact: true }),
  ).toHaveCount(0);
  await expect(
    ui.getByText("Categorical bar chart", { exact: true }),
  ).toBeAttached();
  await expect
    .poll(() =>
      page
        .locator("iframe")
        .evaluate((element) =>
          Math.abs(element.getBoundingClientRect().bottom - window.innerHeight),
        ),
    )
    .toBeLessThan(100);
  const jump = page.getByRole("button", {
    name: "Jump to latest",
    exact: true,
  });
  await page.mouse.wheel(0, 1);
  await expect(jump).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(jump).toBeVisible();
  await jump.click();
  await expect(jump).toHaveCount(0);
  await page.mouse.wheel(0, -600);
  await expect(jump).toBeVisible();
  const top = await page.evaluate(() => window.scrollY);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeLessThanOrEqual(top + 20);
  await jump.click();
  await expect(jump).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator("iframe")
        .evaluate((element) =>
          Math.abs(element.getBoundingClientRect().bottom - window.innerHeight),
        ),
    )
    .toBeLessThan(100);
  await expect(ui.locator('[data-complete="true"]')).toBeAttached();
  await expect
    .poll(() =>
      page
        .locator("iframe")
        .evaluate((element) =>
          Math.abs(element.getBoundingClientRect().bottom - window.innerHeight),
        ),
    )
    .toBeLessThan(100);
});
