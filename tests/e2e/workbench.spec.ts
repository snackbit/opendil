import { readFileSync } from "node:fs";
import {
  expect,
  test,
  type FrameLocator,
  type Locator,
  type Page,
} from "@playwright/test";
import { executableExamples } from "../../scripts/agent-spec-api.mjs";
import { exampleIds } from "../../apps/site/lib/examples/catalog";
import { closeSettings, replaceSource } from "./site-demo-page";

type Mode = "isolated" | "shadow" | "host";
const modeLabels = {
  isolated: "Iframe",
  shadow: "Shadow DOM",
  host: "Host DOM",
} as const;

/*
 * The /demo/<example>/ playground. Specs use relative URLs so they follow SITE_BASE_PATH.
 * Showcase and interaction regressions are in site-showcase.spec.ts.
 */

/** The first message in the playground preview, in whichever mode it renders. */
function preview(page: Page, mode: Mode): Locator | FrameLocator {
  const output = page.locator(".od-hero-output");
  return mode === "isolated"
    ? output.frameLocator("iframe").first()
    : output.locator(`[data-dil-mode="${mode}"]`).first();
}

const specExamples = executableExamples(
  readFileSync("spec/genui.examples.md", "utf8"),
  "genui.examples.md",
);
/** The source of a task from the agent spec's examples catalog. */
function example(heading: string) {
  const found = specExamples.find((entry) =>
    entry.name.endsWith(": " + heading),
  );
  if (!found) throw new Error("Missing documented example: " + heading);
  return found.source;
}

function pageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

for (const mode of ["isolated", "shadow", "host"] as const) {
  test(`every example renders and streams in ${modeLabels[mode]} mode`, async ({
    page,
  }) => {
    test.setTimeout(240000);
    await page.addInitScript((mode) => {
      // Init scripts also run in the sandboxed renderer frame, which has no storage.
      if (window !== window.top) return;
      sessionStorage.setItem(
        "opendil:renderer-preferences:v2",
        JSON.stringify({ mode, reveal: false }),
      );
    }, mode);
    const errors = pageErrors(page);
    for (const id of exampleIds) {
      const response = await page.goto("demo/" + id + "/");
      expect(response?.status(), id).toBe(200);
      // The prerendered HTML carries the page heading and no Next.js error shell.
      const html = (await response?.text()) ?? "";
      expect(html, id).toContain('class="sr-only"');
      expect(html, id).not.toContain("__next_error__");
      // Custom components need a renderer in the page, so customization falls back to Shadow DOM.
      const actual =
        id === "customization" && mode === "isolated" ? "shadow" : mode;
      const ui = preview(page, actual);
      await expect(
        ui.locator('[data-complete="true"]').first(),
        id,
      ).toBeAttached({
        timeout: 30000,
      });
      const replay = page.getByRole("button", { name: "Replay", exact: true });
      if (id === "customization") {
        await expect(replay).toBeDisabled();
        continue;
      }
      // One token per second keeps the stream observably incomplete until Finish.
      await page
        .getByRole("slider", { name: "Animation speed", exact: true })
        .press("Home");
      await expect(page.getByText("1 tok/s", { exact: true })).toBeVisible();
      await replay.click();
      await expect(
        ui.locator('[data-complete="false"]').first(),
        id,
      ).toBeAttached({ timeout: 30000 });
      await page.getByRole("button", { name: "Finish", exact: true }).click();
      await expect(
        ui.locator('[data-complete="true"]').first(),
        id,
      ).toBeAttached({
        timeout: 30000,
      });
    }
    expect(errors).toEqual([]);
  });
}

test("unknown examples are not routes", async ({ request }) => {
  expect((await request.get("demo/unknown/")).status()).toBe(404);
});

test("only the replay worker loads the tokenizer", async ({ page }) => {
  const errors = pageErrors(page);
  const fetched = new Set<string>();
  page.on("response", (response) => {
    if (/\.js(?:\?|$)/.test(response.url())) fetched.add(response.url());
  });
  await page.goto("demo/form/");
  await expect(
    preview(page, "shadow").locator('[data-complete="true"]'),
  ).toBeAttached();
  await page
    .getByRole("slider", { name: "Animation speed", exact: true })
    .press("Home");
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  // Replay starts once the tokenizer worker has returned the token offsets.
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeEnabled();
  const withTokenizer = async (urls: Iterable<string>) => {
    const scripts = [...urls].filter((url) => /\.js(?:\?|$)/.test(url));
    const bodies = await Promise.all(
      scripts.map(async (url) => (await page.request.get(url)).text()),
    );
    return scripts.filter((_, index) => bodies[index]?.includes("o200k_base"));
  };
  // The document's resource entries list only what the page itself loaded, not its workers.
  const own = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((entry) => entry.name),
  );
  expect(own.length).toBeGreaterThan(0);
  expect(await withTokenizer(own)).toEqual([]);
  // The network saw the tokenizer chunk, so something other than the document (its worker) loaded it.
  expect(await withTokenizer(fetched)).not.toEqual([]);
  expect(errors).toEqual([]);
});

test("demo uses the homepage workbench with populated bounded panes", async ({
  page,
}, testInfo) => {
  await page.goto("demo/deployment/");
  const frame = page.locator(".od-stream-demo");
  await expect(
    frame
      .locator(".od-hero-demo-toolbar")
      .getByRole("combobox", { name: "Open example" }),
  ).toBeVisible();
  await expect(
    frame
      .locator(".od-hero-code")
      .getByRole("textbox", { name: "DIL source", exact: true }),
  ).toBeVisible();
  await expect(
    frame
      .locator(".od-hero-output")
      .getByRole("heading", { name: "Ship something good.", exact: true }),
  ).toBeVisible();
  await expect(frame.locator(".od-hero-demo")).toHaveCSS("height", "700px");
  await testInfo.attach("shared-demo-workbench", {
    body: await frame.screenshot(),
    contentType: "image/png",
  });
});

test("playback settings start with reveal enabled and carry across client-side example changes", async ({
  page,
}) => {
  const documents: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "document") documents.push(request.url());
  });
  await page.goto("demo/deployment/");
  await page.evaluate(() => Reflect.set(window, "siteMarker", "kept"));
  documents.length = 0;
  await page.getByRole("button", { name: "Demo settings" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Progressive reveal" }),
  ).toBeChecked();
  const boxes = await Promise.all(
    Object.values(modeLabels).map((name) =>
      page.getByRole("radio", { name, exact: true }).boundingBox(),
    ),
  );
  expect(
    boxes.every((box) => box && box.y === boxes[0]?.y && box.height <= 26),
  ).toBe(true);
  await page.getByRole("checkbox", { name: "Progressive reveal" }).uncheck();
  await page.getByRole("radio", { name: "Host DOM", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "Open example" }).click();
  await page.getByRole("option", { name: "pricing.dil", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/pricing\/$/);
  await expect(
    page.locator('.od-hero-output [data-dil-mode="host"]'),
  ).toBeAttached();
  await page.getByRole("button", { name: "Demo settings" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Progressive reveal" }),
  ).not.toBeChecked();
  await page.keyboard.press("Escape");
  await page.goBack();
  await expect(page).toHaveURL(/\/demo\/deployment\/$/);
  await expect(
    page.getByRole("combobox", { name: "Open example" }),
  ).toContainText("deployment.dil");
  expect(await page.evaluate(() => Reflect.get(window, "siteMarker"))).toBe(
    "kept",
  );
  expect(documents).toEqual([]);
});

test("Monaco edits DIL, persists drafts, and resets without an editor footer", async ({
  page,
}) => {
  await page.goto("demo/form/");
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Auto-run", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "React usage", exact: true }),
  ).toHaveCount(0);
  const source = page.getByRole("textbox", { name: /DIL source/ });
  await page.locator(".od-source-editor").click({ position: { x: 90, y: 30 } });
  await source.press("ControlOrMeta+A");
  await page.keyboard.insertText("<box><title>A Monaco draft</title></box>");
  await expect(
    page.getByRole("heading", { name: "A Monaco draft" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A Monaco draft" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Make yourself at home.", exact: true }),
  ).toBeVisible();
});

test("appearance is optional compact popover content", async ({ page }) => {
  await page.goto("demo/deployment/");
  await page.getByRole("button", { name: "Demo settings" }).click();
  await page.getByRole("radio", { name: "Iframe", exact: true }).click();
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("heading", { name: "Ship something good.", exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Host DOM", exact: true }).click();
  await expect(page.locator('[data-dil-mode="host"]')).toBeAttached();
  await page.getByRole("radio", { name: "Shadow DOM", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Shadow DOM", exact: true }),
  ).toHaveAttribute("data-state", "on");
  await page
    .getByRole("button", { name: "Output appearance", exact: true })
    .click();
  await page.getByRole("radio", { name: "Dark output", exact: true }).click();
  await page.getByRole("radio", { name: "Pill", exact: true }).click();
  await page.keyboard.press("Escape");
  const output = page.locator('[data-dil-mode="shadow"]').first();
  await expect(output.locator(".dil-scope")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await expect(output.locator(".dil-scope")).toHaveCSS("color-scheme", "dark");
  await expect(
    output.getByRole("radio", { name: "US East", exact: true }),
  ).toHaveCSS("color", "rgb(250, 250, 250)");
  await output
    .getByRole("button", { name: "Deploy application", exact: true })
    .click();
  await expect(
    output.getByRole("button", { name: "Deployment created", exact: true }),
  ).toBeVisible();
});

test("malformed drafts show readers short wording and authors the source position", async ({
  page,
}) => {
  await page.goto("demo/form/");
  const source = page.getByRole("textbox", { name: /DIL source/ });
  await page.locator(".od-source-editor").click({ position: { x: 90, y: 30 } });
  await source.press("ControlOrMeta+A");
  await page.keyboard.insertText(
    '<box><title>Kept heading</title></box>\n<slider max=5 value="1"/>\n<grid><box>Cut',
  );
  const problems = page.getByRole("list", { name: "Source problems" });
  const check = async (ui: Locator | FrameLocator) => {
    await expect(
      ui.getByRole("heading", { name: "Kept heading", exact: true }),
    ).toBeVisible();
    await expect(
      ui.getByText("This part of the response couldn't be shown.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(ui.getByText(/at character/)).toHaveCount(0);
    await expect(problems).toContainText(
      "Line 2, column 1: Expected quoted value or expression for max",
    );
    await expect(problems).toContainText(
      "Line 3, column 1: The document ended before it was finished.",
    );
  };
  await check(preview(page, "shadow"));
  // The iframe runtime forwards the same details through its message port.
  await page
    .getByRole("button", { name: "Demo settings", exact: true })
    .click();
  await page.getByRole("radio", { name: "Iframe", exact: true }).click();
  await closeSettings(page);
  await check(preview(page, "isolated"));
});

test("the Monaco editor follows the site theme", async ({ page }) => {
  await page.goto("demo/form/");
  const editor = page.locator(".od-source-editor .monaco-editor");
  await expect(editor).toHaveClass(/\bvs\b/);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expect(editor).toHaveClass(/\bvs-dark\b/);
});

test("leaving and reopening the playground client-side starts a clean workbench", async ({
  page,
}) => {
  const errors = pageErrors(page);
  const documents: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "document") documents.push(request.url());
  });
  await page.goto("demo/form/");
  await expect(page.locator(".monaco-editor")).toBeVisible();
  documents.length = 0;
  // Leave mid-replay so the replay loop, editor and renderer all unmount while active.
  await page
    .getByRole("slider", { name: "Animation speed", exact: true })
    .press("Home");
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeEnabled();
  await page.getByRole("banner").getByRole("link", { name: "Docs" }).click();
  await expect(page).toHaveURL(/\/docs\/$/);
  await expect(page.locator(".od-stream-demo")).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/demo\/form\/$/);
  await expect(page.locator(".monaco-editor")).toHaveCount(1);
  await expect(
    preview(page, "shadow").locator('[data-complete="true"]'),
  ).toBeAttached();
  await expect(page.getByText("150 tok/s", { exact: true })).toBeVisible();
  expect(documents).toEqual([]);
  expect(errors).toEqual([]);
});

test("documented counter and validation form run in the workbench", async ({
  page,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("demo/deployment/");
  const editor = page.getByRole("textbox", { name: "DIL source", exact: true });
  await replaceSource(page, editor, example("Task: controlled-counter"));
  const output = preview(page, "shadow");
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
  await page.goto("demo/deployment/");
  const editor = page.getByRole("textbox", { name: "DIL source", exact: true });
  const output = preview(page, "shadow");
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
