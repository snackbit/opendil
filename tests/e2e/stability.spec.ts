import { expect, test } from "@playwright/test";
import { dilPage, openShowcase } from "./dil-page";
test.use({
  viewport: { width: 1250, height: 1212 },
  video: { mode: "on", size: { width: 1250, height: 1212 } },
});
test("streamed Markdown keeps already presented element identities", async ({
  page,
}) => {
  await openShowcase(page);
  await page
    .getByRole("button", { name: "Progressive reveal", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Replay stream", exact: true })
    .click();
  const ui = dilPage(page);
  const heading = ui.getByRole("heading", {
    name: "Interactive workspace",
    exact: true,
  });
  await expect(heading).toBeVisible();
  const original = await heading.elementHandle();
  if (!original) throw new Error("Missing heading");
  const opacity = await original.evaluate(
    (element) =>
      new Promise<number[]>((done) => {
        const samples: number[] = [];
        const sample = () => {
          samples.push(Number(getComputedStyle(element).opacity));
          if (samples.length < 24) requestAnimationFrame(sample);
          else done(samples);
        };
        requestAnimationFrame(sample);
      }),
  );
  for (let index = 1; index < opacity.length; index++)
    expect(opacity[index] ?? 0).toBeGreaterThanOrEqual(
      (opacity[index - 1] ?? 0) - 0.01,
    );
  const start = Number(
    await ui.locator("[data-scanned]").getAttribute("data-scanned"),
  );
  await expect
    .poll(async () =>
      Number(await ui.locator("[data-scanned]").getAttribute("data-scanned")),
    )
    .toBeGreaterThan(start + 256);
  expect(await original.evaluate((element) => element.isConnected)).toBe(true);
});
test("fast viewport replacement does not exhaust execution or rendering resources", async ({
  page,
}) => {
  await openShowcase(page);
  const ui = dilPage(page);
  for (const reveal of [false, true]) {
    if (reveal)
      await page
        .getByRole("button", { name: "Progressive reveal", exact: true })
        .click();
    for (const fixture of ["Large document", "Long list", "Long table"]) {
      await page.getByRole("radio", { name: fixture, exact: true }).click();
      await expect(ui.locator('[data-complete="true"]')).toBeAttached();
      for (let index = 0; index < 28; index++) {
        await page.evaluate(
          (offset) => {
            window.scrollTo(0, offset);
            return new Promise<void>((done) =>
              requestAnimationFrame(() => requestAnimationFrame(() => done())),
            );
          },
          [0, 80000, 400000, 120000, 700000, 250000, 1200000][index % 7] ?? 0,
        );
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      const first =
        fixture === "Large document" ? "Select record 1" : "Inspect Entry 1";
      await expect(
        ui.getByRole("button", { name: first, exact: true }),
      ).toBeEnabled();
      await ui.getByRole("button", { name: first, exact: true }).click();
      await expect(
        ui.getByText(
          fixture === "Large document" ? "Selected record 1" : "Selected",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(ui.getByRole("alert")).toHaveCount(0);
    }
  }
});
test("a full reveal replay keeps completed content and settles without errors", async ({
  page,
}) => {
  await openShowcase(page);
  await page
    .getByRole("button", { name: "Demo settings", exact: true })
    .click();
  await page
    .getByRole("spinbutton", { name: "Tokens per second", exact: true })
    .fill("1000");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Progressive reveal", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Replay stream", exact: true })
    .click();
  const ui = dilPage(page);
  await expect(ui.locator('[data-complete="true"]')).toBeAttached({
    timeout: 30000,
  });
  await expect(ui.getByRole("alert")).toHaveCount(0);
  await expect(ui.locator("[data-dil-revealing]")).toHaveCount(0);
});
