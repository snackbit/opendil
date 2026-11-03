import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("agent spec is reachable and copies its exact source", async ({
  page,
}) => {
  const source = readFileSync("spec/genui.agent.md", "utf8");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  for (const route of ["/", "/demo/", "/docs/getting-started/"]) {
    await page.goto(route);
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Agent Spec", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Agent Spec", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Agent Spec", exact: true }),
    ).toHaveAttribute("aria-current", "page");
  }
  await page.reload();
  await expect(page.locator(".agent-source")).toHaveText(source);
  await page.getByRole("button", { name: "Copy spec", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(source);
  for (const width of [320, 375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("link", { name: "Agent Spec", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denied")) },
      configurable: true,
    });
  });
  await page.getByRole("button", { name: "Copy spec", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Copy spec", exact: true }),
  ).toContainText("Copy failed");
});

test("documented counter and form run in the workbench", async ({ page }) => {
  const examples = [
    ...readFileSync("spec/genui.examples.md", "utf8").matchAll(
      /```dil\n([\s\S]*?)```/g,
    ),
  ].map((m) => m[1] ?? "");
  await page.goto("/demo/");
  const editor = page.getByRole("textbox", { name: "DIL source", exact: true });
  await editor.fill(examples[1] ?? "");
  const output = page.locator('[data-dil-mode="shadow"]');
  await output.getByRole("button", { name: "Increment", exact: true }).click();
  await expect(output.getByText("Started", { exact: true })).toBeVisible();
  await editor.fill(examples[3] ?? "");
  await expect(
    output.getByRole("button", { name: "Copy name", exact: true }),
  ).toBeDisabled();
  await output.getByRole("textbox", { name: "Name", exact: true }).fill("Ada");
  await expect(
    output.getByRole("button", { name: "Copy name", exact: true }),
  ).toBeEnabled();
});
