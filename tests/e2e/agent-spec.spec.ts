import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { replaceSource } from "./dil-page";
import { executableExamples } from "../../scripts/agent-spec-api.mjs";

const examples = executableExamples(
  readFileSync("spec/genui.examples.md", "utf8"),
  "genui.examples.md",
);
function example(heading: string) {
  const found = examples.find((entry) => entry.name.endsWith(": " + heading));
  if (!found) throw new Error("Missing documented example: " + heading);
  return found.source;
}

test("agent spec is reachable and copies its exact source", async ({
  page,
}) => {
  const source = readFileSync("spec/genui.agent.md", "utf8");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  for (const route of ["/", "/demo/", "/docs/getting-started/"]) {
    await page.goto(route);
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Agent Spec", exact: true }),
    ).toHaveCount(0);
  }
  await page.goto("/docs/language/");
  await page.getByRole("link", { name: "Agent Spec", exact: true }).click();
  await expect(page).toHaveURL(/\/agent-spec\/$/);
  await page.reload();
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Agent Spec", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Agent Spec", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".agent-source")).toHaveText(source);
  await page.getByRole("button", { name: "Copy spec", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(source);
  for (const width of [320, 375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("heading", { name: "Agent Spec", exact: true }),
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

test("documented counter and validation form run in the workbench", async ({
  page,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/demo/");
  const editor = page.getByRole("textbox", { name: "DIL source", exact: true });
  await replaceSource(page, editor, example("Task: controlled-counter"));
  const output = page.locator('[data-dil-mode="shadow"]');
  await output.getByRole("button", { name: "Increment", exact: true }).click();
  await expect(output.getByText("Started", { exact: true })).toBeVisible();
  await expect(output.getByText("Count: 1", { exact: true })).toBeVisible();
  await output.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(output.getByText("Count: 0", { exact: true })).toBeVisible();
  await expect(output.getByText("Waiting", { exact: true })).toBeVisible();
  await replaceSource(page, editor, example("Task: validation-form"));
  await expect(
    output.getByRole("button", { name: "Copy name", exact: true }),
  ).toBeDisabled();
  await output.getByRole("textbox", { name: "Name", exact: true }).fill("Ada");
  await expect(
    output.getByRole("button", { name: "Copy name", exact: true }),
  ).toBeEnabled();
  await output.getByRole("button", { name: "Copy name", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("Ada");
  await output.getByRole("textbox", { name: "Name", exact: true }).fill("A");
  await expect(
    output.getByRole("button", { name: "Copy name", exact: true }),
  ).toBeDisabled();
  await expect(
    output.getByText("Enter a name between 2 and 80 characters.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("documented generation tasks render and react to user input", async ({
  page,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/demo/");
  const editor = page.getByRole("textbox", { name: "DIL source", exact: true });
  const output = page.locator('[data-dil-mode="shadow"]');
  await replaceSource(page, editor, example("Task: static-card"));
  await expect(
    output.getByRole("heading", { name: "Release review", exact: true }),
  ).toBeVisible();
  await replaceSource(page, editor, example("Task: conditional-status"));
  await output.getByRole("radio", { name: "Ready", exact: true }).click();
  await expect(output.getByText("Ready", { exact: true }).last()).toBeVisible();
  await output.getByRole("radio", { name: "Blocked", exact: true }).click();
  await expect(
    output.getByText("Blocked", { exact: true }).last(),
  ).toBeVisible();
  await replaceSource(page, editor, example("Task: dynamic-list"));
  await output.getByRole("button", { name: "Add item", exact: true }).click();
  await expect(output.getByText("2. Item 2", { exact: true })).toBeVisible();
  await output
    .getByRole("button", { name: "Remove Item 1", exact: true })
    .click();
  await expect(output.getByText("1. Item 2", { exact: true })).toBeVisible();
  await output.getByRole("button", { name: "Add item", exact: true }).click();
  await expect(output.getByText("2. Item 3", { exact: true })).toBeVisible();
  await replaceSource(page, editor, example("Task: external-data"));
  await output
    .getByRole("textbox", { name: "Filter supplied records" })
    .fill("Beta");
  await expect(
    output.getByRole("cell", { name: "Beta", exact: true }),
  ).toBeVisible();
  await expect(
    output.getByRole("cell", { name: "Alpha", exact: true }),
  ).toHaveCount(0);
  await output
    .getByRole("textbox", { name: "Filter supplied records" })
    .fill("missing");
  await expect(
    output.getByText("No matching records.", { exact: true }),
  ).toBeVisible();
  await replaceSource(page, editor, example("Task: host-action"));
  await output
    .getByRole("button", { name: "Copy report", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("Review complete: Alpha and Beta checked.");
  await replaceSource(page, editor, example("Task: incomplete-stream"));
  await expect(output.getByText("Ready", { exact: true })).toBeVisible();
  await expect(output.getByRole("alert")).toHaveCount(0);
});
