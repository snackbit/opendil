import { expect, test, type Page } from "@playwright/test";
import {
  closeSettings,
  openShowcase,
  previewPane,
  replaceSource,
  tailGap,
} from "./site-demo-page";

/* rendering-modes.spec.ts, run against the Next.js playground with URLs relative to SITE_BASE_PATH. */
test.use({ video: { mode: "on", size: { width: 1280, height: 900 } } });
async function mode(page: Page, name: "Shadow DOM" | "Host DOM") {
  await page
    .getByRole("button", { name: "Demo settings", exact: true })
    .click();
  await page.getByRole("radio", { name, exact: true }).click();
  await closeSettings(page);
}
for (const name of ["Iframe", "Shadow DOM", "Host DOM"] as const) {
  test(`${name} rejects resource-loading diagrams before rendering and bounds nested input`, async ({
    page,
  }) => {
    const requests: string[] = [];
    await page.route("https://audit.invalid/**", (route) => {
      requests.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
      });
    });
    await openShowcase(page);
    if (name !== "Iframe") await mode(page, name);
    const ui =
      name === "Iframe"
        ? page.frameLocator("iframe").first()
        : page
            .locator(
              `[data-dil-mode="${name === "Host DOM" ? "host" : "shadow"}"]`,
            )
            .first();
    const editor = page.getByRole("textbox", {
      name: "DIL source",
      exact: true,
    });
    for (const metadata of [
      'img: "https://audit.invalid/pixel.svg"',
      '"img": "https://audit.invalid/pixel.svg"',
      '"\\u0069mg": "https://audit.invalid/pixel.svg"',
    ]) {
      const diagram = `flowchart TD\nA@{ ${metadata}, label: "A", h: 60 }`;
      await replaceSource(
        page,
        editor,
        `<Mermaid source={${JSON.stringify(diagram)}}/>`,
      );
      await expect(ui.getByRole("alert")).toContainText("not supported");
      expect(requests).toEqual([]);
    }
    // Exercise both the synchronous first render and the parser worker.
    for (const depth of [1000, 2000]) {
      const prefix = `Prefix ${depth}`;
      await replaceSource(
        page,
        editor,
        prefix + "\n\n" + "<box>".repeat(depth) + "</box>".repeat(depth),
      );
      await expect(ui.getByRole("alert")).toContainText("nesting limit");
      await expect(ui.getByText(prefix, { exact: true })).toBeVisible();
    }
    await replaceSource(
      page,
      editor,
      '<Mermaid source={"flowchart TD\\nA-->B"}/>',
    );
    await expect(ui.getByLabel("Mermaid diagram").locator("svg")).toBeVisible();
    await expect(ui.getByRole("alert")).toHaveCount(0);
    expect(requests).toEqual([]);
  });
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
  // The finished document can still be mounted right after the click; wait
  // for the replayed one, so the chart below is the stream's, not the old copy's.
  await expect(ui.locator('[data-complete="false"]')).toBeAttached();
  await expect(
    ui.getByText("Categorical bar chart", { exact: true }),
  ).toBeAttached();
  // "Jump to latest" exists only while the document is unfinished. Hold the
  // replay so a fast or slow runner cannot finish it between steps.
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page
    .getByRole("button", { name: "Demo settings", exact: true })
    .click();
  await page
    .getByRole("spinbutton", { name: "Scroll ahead (px)", exact: true })
    .fill("32");
  await page.keyboard.press("Escape");
  await expect.poll(() => tailGap(page.locator("iframe"), 32)).toBeLessThan(3);
  await previewPane(page).hover();
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
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(ui.locator('[data-complete="true"]')).toBeAttached();
  await expect.poll(() => tailGap(page.locator("iframe"), 32)).toBeLessThan(3);
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
      const pane = document.querySelector(".od-hero-output");
      const sample = () => {
        const root = document.querySelector('[data-dil-mode="shadow"]');
        if (root && pane && pane.scrollTop > 0)
          lag.push(
            Math.max(
              0,
              root.getBoundingClientRect().bottom +
                32 -
                pane.getBoundingClientRect().bottom,
            ),
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
    await expect.poll(() => tailGap(ui, 32)).toBeLessThan(3);
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
test("host mode keeps Markdown lists under a page CSS reset and themes status badges", async ({
  page,
}) => {
  await page.goto("demo/form/");
  await mode(page, "Host DOM");
  // An unlayered reset like Tailwind's preflight in a host app.
  await page.addStyleTag({
    content:
      "ol, ul { list-style: none; margin: 0; padding: 0 } blockquote { margin: 0 }",
  });
  const source = page.getByRole("textbox", { name: "DIL source", exact: true });
  await replaceSource(
    page,
    source,
    '1. First\n2. Second\n\n- Bullet\n  - Nested\n\n> Tip: quoted\n\n<badge color="success">Healthy</badge>',
  );
  await source.press("ControlOrMeta+Enter");
  const ui = page.locator('[data-dil-mode="host"]').first();
  const ordered = ui.locator(".dil-markdown ol").first();
  await expect(ordered).toHaveCSS("list-style-type", "decimal");
  await expect(ordered).toHaveCSS("padding-left", "40px");
  const bullets = ui.locator(".dil-markdown ul").first();
  await expect(bullets).toHaveCSS("list-style-type", "disc");
  await expect(bullets.locator("ul")).toHaveCSS("list-style-type", "circle");
  await expect(ui.locator(".dil-markdown blockquote")).toHaveCSS(
    "margin-left",
    "40px",
  );
  const badge = ui.locator('[data-slot="badge"]', { hasText: "Healthy" });
  await expect(badge).toHaveCSS("background-color", "rgb(229, 245, 238)");
  await page.getByRole("button", { name: "Demo settings" }).click();
  await page
    .getByRole("button", { name: "Output appearance", exact: true })
    .click();
  await page.getByRole("radio", { name: "Dark output", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(badge).toHaveCSS("background-color", "rgb(29, 58, 47)");
  await expect(badge).toHaveCSS("color", "rgb(92, 197, 154)");
});
