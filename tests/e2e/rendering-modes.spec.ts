import { expect, test, type Page } from "@playwright/test";
import { openShowcase } from "./dil-page";
test.use({ video: { mode: "on", size: { width: 1280, height: 900 } } });
async function mode(page: Page, name: "Shadow DOM" | "Host DOM") {
  await page
    .getByRole("button", { name: "Demo settings", exact: true })
    .click();
  await page.getByRole("radio", { name, exact: true }).click();
  await page.keyboard.press("Escape");
}
for (const name of ["Shadow DOM", "Host DOM"] as const) {
  test(`${name} retains stock interactions and scoped overlays`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openShowcase(page);
    await mode(page, name);
    const ui = page
      .locator(`[data-dil-mode="${name === "Shadow DOM" ? "shadow" : "host"}"]`)
      .first();
    await expect(
      ui.getByRole("heading", {
        name: "Interactive workspace",
        exact: true,
      }),
    ).toBeVisible();
    await ui
      .getByRole("textbox", { name: "Display name", exact: true })
      .fill("Shadow Ada");
    await expect(
      ui.getByText("Welcome back, Shadow Ada", { exact: true }),
    ).toBeVisible();
    await ui.getByRole("button", { name: "Show popover", exact: true }).click();
    const popup = ui.locator('[data-slot="popover-content"]');
    await expect(popup).toContainText("Contextual popover");
    if (name === "Shadow DOM")
      expect(
        await popup.evaluate(
          (element) => element.getRootNode() instanceof ShadowRoot,
        ),
      ).toBe(true);
    await page.keyboard.press("Escape");
    // The scope contains absolutely positioned parts so chat scroll containers keep them.
    expect(
      await ui
        .locator('.dil-document > div > span.sr-only[role="status"]')
        .evaluate((element) =>
          (element as HTMLElement).offsetParent?.classList.contains(
            "dil-scope",
          ),
        ),
    ).toBe(true);
    const wrap = ui.getByRole("button", { name: "Word wrap", exact: true });
    // Ghost buttons use the renderer foreground, not the user-agent ButtonText color.
    await expect(wrap).toHaveCSS("color", "rgb(13, 13, 13)");
    await expect(wrap).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await wrap.click();
    await expect(
      ui.getByRole("textbox", { name: "Code editor", exact: true }),
    ).toHaveAttribute("wrap", "soft");
    await expect(
      ui.locator(".dil-code-highlight .hljs-keyword").first(),
    ).toBeVisible();
    if (name === "Shadow DOM") {
      await page.addStyleTag({
        content:
          "h1{font-size:99px!important} button{font-size:80px!important}",
      });
      expect(
        await ui
          .getByRole("heading", {
            name: "Interactive workspace",
            exact: true,
          })
          .evaluate((element) => getComputedStyle(element).fontSize),
      ).not.toBe("99px");
      expect(
        await ui
          .getByRole("button", { name: "Test interaction", exact: true })
          .evaluate((element) => getComputedStyle(element).fontSize),
      ).not.toBe("80px");
    }
    await testInfo.attach("rendering-mode", {
      body: await ui.screenshot(),
      contentType: "image/png",
    });
    expect(errors).toEqual([]);
  });
}
test("shadow messages keep QuickJS limits, Mermaid output and neighboring state independent", async ({
  page,
}) => {
  await openShowcase(page);
  await mode(page, "Shadow DOM");
  await page.getByRole("radio", { name: "Isolation", exact: true }).click();
  const ui = page.locator('[data-dil-mode="shadow"]').first();
  const neighbor = page.locator('[data-dil-mode="shadow"]').nth(1);
  await expect(
    ui.getByText("DOM access: Blocked", { exact: true }),
  ).toBeVisible();
  await expect(ui.getByLabel("Mermaid diagram").locator("svg")).toContainText(
    "Source",
  );
  await ui
    .getByRole("button", { name: "Test execution limit", exact: true })
    .click();
  await expect(ui.getByRole("alert")).toHaveCount(1);
  await expect(ui.getByRole("alert")).toContainText("time limit");
  await neighbor
    .getByRole("button", { name: "Increment neighbor", exact: true })
    .click();
  await expect(
    neighbor.getByText("Neighbor count: 1", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restart isolation demo", exact: true })
    .click();
  await expect(ui.getByRole("alert")).toHaveCount(0);
});
test("token replay accepts precise rates, pauses, changes rate and completes", async ({
  page,
}) => {
  await openShowcase(page);
  await page
    .getByRole("button", { name: "Demo settings", exact: true })
    .click();
  const input = page.getByRole("spinbutton", {
    name: "Tokens per second",
    exact: true,
  });
  await expect(input).toHaveValue("150");
  await input.fill("1");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  const ui = page.frameLocator("iframe");
  await expect(ui.locator('[data-complete="false"]')).toBeAttached();
  await expect
    .poll(async () =>
      Number(await ui.locator("[data-scanned]").getAttribute("data-scanned")),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  // Let the already submitted parser batch commit, then verify no more source is submitted.
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      ),
  );
  const paused = await ui
    .locator("[data-scanned]")
    .getAttribute("data-scanned");
  await page
    .getByRole("button", { name: "Demo settings", exact: true })
    .click();
  await input.fill("0");
  await input.press("Tab");
  await expect(input).toHaveValue("1");
  const slider = page.getByRole("slider", {
    name: "Replay token rate",
    exact: true,
  });
  await slider.press("End");
  await expect(input).toHaveValue("1000");
  await slider.press("ArrowLeft");
  await expect(input).toHaveValue("999");
  await slider.press("End");
  await page.keyboard.press("Escape");
  expect(await ui.locator("[data-scanned]").getAttribute("data-scanned")).toBe(
    paused,
  );
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(ui.locator('[data-complete="true"]')).toBeAttached({
    timeout: 30000,
  });
  await expect(
    ui.getByRole("button", { name: "Copy all settings", exact: true }),
  ).toBeAttached();
  await expect(ui.getByRole("alert")).toHaveCount(0);
});
test("scroll behavior and ahead padding update following without undoing a manual pause", async ({
  page,
}) => {
  await openShowcase(page, "?benchmark=1");
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  const ui = page.frameLocator("iframe");
  await expect(
    ui.getByText("Categorical bar chart", { exact: true }),
  ).toBeAttached();
  await page
    .getByRole("button", { name: "Demo settings", exact: true })
    .click();
  await page
    .getByRole("spinbutton", { name: "Scroll ahead (px)", exact: true })
    .fill("32");
  await page.keyboard.press("Escape");
  await expect
    .poll(() =>
      page
        .locator("iframe")
        .evaluate((element) =>
          Math.abs(
            element.getBoundingClientRect().bottom - window.innerHeight + 32,
          ),
        ),
    )
    .toBeLessThan(3);
  await page.mouse.wheel(0, -1);
  const jump = page.getByRole("button", {
    name: "Jump to latest",
    exact: true,
  });
  await expect(jump).toBeVisible();
  await page
    .getByRole("button", { name: "Demo settings", exact: true })
    .click();
  await page.getByRole("radio", { name: "Smooth", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(jump).toBeVisible();
  await jump.click();
  await expect(jump).toHaveCount(0);
  await expect(ui.locator('[data-complete="true"]')).toBeAttached();
  await expect
    .poll(() =>
      page
        .locator("iframe")
        .evaluate((element) =>
          Math.abs(
            element.getBoundingClientRect().bottom - window.innerHeight + 32,
          ),
        ),
    )
    .toBeLessThan(3);
});
test.describe("High-throughput playback", () => {
  test("smooth following catches the tail at 500 tokens/sec with 200 ms presentation commits", async ({
    page,
  }, testInfo) => {
    await openShowcase(page);
    await mode(page, "Shadow DOM");
    await page
      .getByRole("button", { name: "Demo settings", exact: true })
      .click();
    await page
      .getByRole("spinbutton", { name: "Tokens per second", exact: true })
      .fill("500");
    await page.getByRole("radio", { name: "Timed", exact: true }).click();
    await expect(
      page.getByRole("spinbutton", {
        name: "Update interval (ms)",
        exact: true,
      }),
    ).toHaveValue("200");
    await page.getByRole("radio", { name: "Smooth", exact: true }).click();
    await page
      .getByRole("spinbutton", { name: "Scroll ahead (px)", exact: true })
      .fill("32");
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const commits: number[] = [],
        lag: number[] = [];
      const commit = () => commits.push(performance.now());
      window.addEventListener("dil:commit", commit);
      let frame = 0;
      const sample = () => {
        const root = document.querySelector('[data-dil-mode="shadow"]');
        if (root && window.scrollY > 0)
          lag.push(
            Math.max(0, root.getBoundingClientRect().bottom - innerHeight + 32),
          );
        frame = requestAnimationFrame(sample);
      };
      frame = requestAnimationFrame(sample);
      Reflect.set(window, "followSample", {
        commits,
        lag,
        stop() {
          cancelAnimationFrame(frame);
          window.removeEventListener("dil:commit", commit);
        },
      });
    });
    await page.getByRole("button", { name: "Replay", exact: true }).click();
    const ui = page.locator('[data-dil-mode="shadow"]').first();
    await expect(ui.locator('[data-complete="false"]')).toBeAttached();
    await expect(ui.locator('[data-complete="true"]')).toBeAttached({
      timeout: 30000,
    });
    await expect
      .poll(() =>
        ui.evaluate((element) =>
          Math.abs(element.getBoundingClientRect().bottom - innerHeight + 32),
        ),
      )
      .toBeLessThan(3);
    const result = await page.evaluate(() => {
      const data: unknown = Reflect.get(window, "followSample");
      if (
        !data ||
        typeof data !== "object" ||
        !("commits" in data) ||
        !Array.isArray(data.commits) ||
        !("lag" in data) ||
        !Array.isArray(data.lag) ||
        !("stop" in data) ||
        typeof data.stop !== "function"
      )
        throw new Error("Missing samples");
      data.stop();
      const commits = data.commits.filter(
        (value): value is number => typeof value === "number",
      );
      const lag = data.lag
        .filter((value): value is number => typeof value === "number")
        .sort((a, b) => a - b);
      return {
        commits: commits.length,
        minimumInterval: Math.min(
          ...commits
            .slice(1)
            .map((value, index) => value - (commits[index] ?? value)),
        ),
        p95Lag: lag[Math.floor(lag.length * 0.95)] ?? Infinity,
      };
    });
    await testInfo.attach("high-tps-following", {
      body: JSON.stringify(result),
      contentType: "application/json",
    });
    expect(result.commits).toBeGreaterThan(10);
    console.log("High TPS following:", JSON.stringify(result));
    expect(result.minimumInterval).toBeGreaterThanOrEqual(180);
    expect(result.p95Lag).toBeLessThan(900);
    await expect(ui.getByRole("alert")).toHaveCount(0);
  });
});
