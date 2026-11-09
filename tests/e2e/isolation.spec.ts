import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { closeSettings, openShowcase, replaceSource } from "./site-demo-page";

/* isolation.spec.ts, run against the Next.js playground with URLs relative to SITE_BASE_PATH. */
test("hostile message cannot reach the host and a loop does not stop another message", async ({
  page,
}) => {
  await openShowcase(page);
  await page.getByRole("radio", { name: "Isolation", exact: true }).click();
  const first = page.frameLocator("iframe").first();
  const second = page.frameLocator("iframe").nth(1);
  await expect(
    first.getByText("DOM access: Blocked", { exact: true }),
  ).toBeVisible();
  await expect(
    first.getByText("Network access: Blocked", { exact: true }),
  ).toBeVisible();
  await expect(
    first.getByText("Host global access: Blocked", { exact: true }),
  ).toBeVisible();
  const frame = page
    .frames()
    .find((frame) => frame.url().includes("/opendil/frame.html"));
  expect(
    await frame?.evaluate(() => {
      try {
        void parent.document;
        return "escaped";
      } catch {
        return "blocked";
      }
    }),
  ).toBe("blocked");
  await expect(
    first
      .getByLabel("Mermaid diagram")
      .locator("svg")
      .getByText("Source", { exact: true }),
  ).toBeVisible();
  await expect(
    first
      .getByLabel("Mermaid diagram")
      .locator("svg")
      .getByText("Worker", { exact: true }),
  ).toBeVisible();
  await first.getByRole("button", { name: "Test rendering limit" }).click();
  await expect(
    first.getByRole("alert").filter({ hasText: /display limit/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restart isolation demo", exact: true })
    .click();
  await first.getByRole("button", { name: "Test execution limit" }).click();
  await expect(
    first.getByRole("button", { name: "Test execution limit" }),
  ).toBeDisabled();
  await expect(
    first.getByText("DOM access: Blocked", { exact: true }),
  ).toBeVisible();
  await expect(first.getByRole("alert")).toHaveCount(1);
  await expect(first.getByRole("alert")).toContainText("time limit");
  await expect(first.getByRole("alert").first()).toBeVisible();
  await second.getByRole("button", { name: "Increment neighbor" }).click();
  await expect(
    second.getByText("Neighbor count: 1", { exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Showcase", exact: true }).click();
  // The picker navigates client-side, so the isolation example's two frames leave after the click.
  await expect(page.locator("iframe")).toHaveCount(1);
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("heading", { name: "€213.60", exact: true }),
  ).toBeVisible();
});
test("the runtime frame starts only inside an opaque-origin sandbox", async ({
  page,
}) => {
  await openShowcase(page);
  const src = await page.locator("iframe").first().getAttribute("src");
  expect(src).toBeTruthy();
  const ready = await page.evaluate(async (src) => {
    const counts = { sandboxed: 0, unsandboxed: 0 };
    const frames = {
      sandboxed: document.createElement("iframe"),
      unsandboxed: document.createElement("iframe"),
    };
    frames.sandboxed.sandbox.add("allow-scripts");
    window.addEventListener("message", (event) => {
      if (event.data?.type !== "dil-ready") return;
      if (event.source === frames.sandboxed.contentWindow) counts.sandboxed++;
      if (event.source === frames.unsandboxed.contentWindow)
        counts.unsandboxed++;
    });
    for (const frame of Object.values(frames)) {
      frame.src = src ?? "";
      document.body.append(frame);
    }
    // Slow machines need longer to load the runtime. Once the sandboxed copy is
    // ready, the unsandboxed copy has had the same time to start and must not.
    const deadline = performance.now() + 15000;
    while (!counts.sandboxed && performance.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 50));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return {
      ...counts,
      hostReachesFrame: frames.unsandboxed.contentDocument !== null,
    };
  }, src);
  expect(ready.sandboxed).toBeGreaterThan(0);
  /*
   * Unlike the Astro demo, the site serves frame.html with `Content-Security-Policy: sandbox
   * allow-scripts` (site-smoke.spec.ts), so an embed without a sandbox attribute still gets an
   * opaque origin and may start. The host must not reach its document either way. (Stripping the
   * header with page.route is not possible: Chromium then blocks the frame's loopback frame.js.)
   */
  expect(ready.hostReachesFrame).toBe(false);
});
test("a failed expression runtime settles a document with unresolved attributes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Fail the worker boundary while preserving the renderer's startup handling.
    Object.defineProperty(window, "Worker", {
      configurable: true,
      value: class {
        constructor() {
          throw new Error("Worker blocked");
        }
      },
    });
  });
  await page.goto("demo/deployment/");
  await page
    .getByRole("button", { name: "Demo settings", exact: true })
    .click();
  await page.getByRole("radio", { name: "Host DOM", exact: true }).click();
  await closeSettings(page);
  const editor = page.getByRole("textbox", { name: "DIL source", exact: true });
  await replaceSource(page, editor, "<box width={1+1}>Content</box>");
  const output = page.locator('.od-hero-output [data-dil-mode="host"]').first();
  await expect(output.getByRole("alert")).toContainText(/runtime|worker/i);
  await expect(output.locator('[data-dil-settled="true"]')).toHaveCount(1);
  await expect(output.locator("[data-dil-held]")).toHaveCount(0);
});
test("typing cannot write the clipboard; activating a document button can", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("demo/form/");
  const ui = page.locator('[data-dil-mode="shadow"]');
  const source = page.getByRole("textbox", { name: "DIL source", exact: true });
  await replaceSource(
    page,
    source,
    '<input placeholder="Pasted command" onChange={(value) => GenUI.copy("typed " + value)} />\n<button onClick={() => GenUI.copy("clicked")}>Copy command</button>',
  );
  await source.press("ControlOrMeta+Enter");
  await ui.getByRole("button", { name: "Copy command", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("clicked");
  await expect(ui.locator(".dil-tooltip")).toContainText("Copied");
  // A denied clipboard call is an action failure and stops the document.
  await ui
    .getByRole("textbox", { name: "Pasted command" })
    .pressSequentially("a");
  await expect(ui.getByRole("alert")).toContainText("requires a user gesture");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "clicked",
  );
});
test("QuickJS bounds deep recursion in a browser worker and fails closed otherwise", async ({
  page,
}) => {
  await openShowcase(page);
  // The renderers embed this worker; the build emits it standalone for tests only.
  const vm = readFileSync("packages/opendil/dist/test/vm.js", "utf8");
  const replies = await page.evaluate(async (vm) => {
    type Reply = { error?: string; fatal?: string; value?: unknown };
    const run = async (sources: string[]) => {
      const worker = new Worker(
        URL.createObjectURL(new Blob([vm], { type: "text/javascript" })),
      );
      const results: Reply[] = [];
      for (const [index, source] of sources.entries())
        results.push(
          await new Promise<Reply>((resolve) => {
            worker.onmessage = (event) => resolve(event.data);
            worker.postMessage({ id: index + 1, type: "evaluate", source });
          }),
        );
      worker.terminate();
      return results;
    };
    const nested = "(()=>{let a=[];for(let i=0;i<3000;i++)a=[a];return a})()";
    return {
      bounded: await run([
        ...[
          "(function f(){return f()+1})()",
          // 10,000 levels overflow the 64 KiB QuickJS stack long before the
          // per-evaluation work budget interrupts the loop that builds them.
          "(()=>{let a=[];for(let i=0;i<1e4;i++)a=[a];return String(a)})()",
          "JSON.parse('['.repeat(1e5)+']'.repeat(1e5))",
        ].flatMap((source) => [source, source, source]),
        nested,
        "1+1",
      ]),
      // Whether 3,000 levels exhaust the host stack depends on how far the
      // process has tiered up the shared QuickJS WebAssembly; 6,000 always do.
      failed: await run([
        "JSON.stringify((()=>{let a=[];for(let i=0;i<6000;i++)a=[a];return a})())",
        "1+1",
      ]),
    };
  }, vm);
  for (const reply of replies.bounded.slice(0, 9)) {
    expect(reply.fatal).toBeUndefined();
    expect(reply.error).toContain("stack overflow");
  }
  expect(replies.bounded[9]?.error).toContain("structural limits");
  expect(replies.bounded[10]?.value).toBe(2);
  // Host stack exhaustion leaves QuickJS inconsistent, so the worker refuses further work.
  expect(replies.failed[0]?.fatal).toContain("call stack");
  expect(replies.failed[1]?.fatal).toBeTruthy();
});
/** Opens the form workbench in iframe mode with a custom source. */
async function runInFrame(page: Page, text: string) {
  await page.goto("demo/form/");
  await page.getByRole("button", { name: "Demo settings" }).click();
  await page.getByRole("radio", { name: "Iframe", exact: true }).click();
  await closeSettings(page);
  const source = page.getByRole("textbox", { name: "DIL source", exact: true });
  await replaceSource(page, source, text);
  await source.press("ControlOrMeta+Enter");
}
test("a missing runtime shows a visible error instead of waiting forever", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("OpenDIL"))
      errors.push(message.text());
  });
  // What a host returns when copy-assets was skipped or runtimeBaseUrl is wrong.
  await page.route("**/opendil/frame.html", (route) =>
    route.fulfill({
      status: 404,
      contentType: "text/html",
      body: "<!doctype html><title>Not found</title><h1>Page not found</h1>",
    }),
  );
  await openShowcaseWithoutFrame(page);
  const alert = page.locator("[data-dil-message]").first().getByRole("alert");
  await expect(alert).toContainText("/opendil/frame.html", { timeout: 15000 });
  await expect(alert).toContainText("npx opendil copy-assets");
  await expect(alert).toContainText("runtimeBaseUrl");
  // The host's 404 page is not shown as message content.
  await expect(page.locator("iframe").first()).toBeHidden();
  expect(errors.length).toBe(1);
  // The absolute runtime URL, including the site's base path.
  expect(errors[0]).toContain(new URL("opendil/", baseURL).href);
});
async function openShowcaseWithoutFrame(page: Page) {
  await page.goto("demo/showcase/");
  await page.getByRole("button", { name: "Demo settings" }).click();
  await page.getByRole("radio", { name: "Iframe", exact: true }).click();
  await page.keyboard.press("Escape");
}
test("the frame announces its version and matching assets start without warnings", async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("OpenDIL")) warnings.push(message.text());
  });
  const versions: unknown[] = [];
  await page.exposeFunction("recordVersion", (version: unknown) =>
    versions.push(version),
  );
  await page.addInitScript(() =>
    window.addEventListener("message", (event) => {
      if (event.data?.type === "dil-ready")
        void Reflect.get(window, "recordVersion")(event.data.version);
    }),
  );
  await openShowcase(page);
  await expect(
    page.frameLocator("iframe").first().locator(".dil-document"),
  ).toBeAttached();
  const { version } = JSON.parse(
    readFileSync("packages/opendil/package.json", "utf8"),
  ) as { version: string };
  await expect.poll(() => versions[0]).toBe(version);
  expect(warnings).toEqual([]);
});
test("a short message sizes its frame to the content without a reserved minimum", async ({
  page,
}) => {
  // Record every height the host gives a frame, to catch 400 → 200 style jumps.
  await page.addInitScript(() => {
    const heights: number[] = [];
    Reflect.set(window, "frameHeights", heights);
    new MutationObserver(() => {
      for (const frame of document.querySelectorAll("iframe"))
        if (frame.style.height) heights.push(parseFloat(frame.style.height));
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
      childList: true,
    });
  });
  await runInFrame(page, "One short answer.");
  const ui = page.frameLocator("iframe").first();
  await expect(
    ui.getByText("One short answer.", { exact: true }),
  ).toBeVisible();
  const frame = page.locator("iframe").first();
  const content = await ui
    .locator("#root")
    .evaluate((element) => element.scrollHeight);
  await expect
    .poll(() =>
      frame.evaluate((element) => (element as HTMLIFrameElement).offsetHeight),
    )
    .toBe(content);
  expect(content).toBeGreaterThan(0);
  expect(content).toBeLessThan(200);
  const heights = (await page.evaluate(() =>
    Reflect.get(window, "frameHeights"),
  )) as number[];
  expect(Math.max(...heights)).toBeLessThanOrEqual(content);
});
test("iframe appearance and tokens update live without restarting the frame", async ({
  page,
}) => {
  await runInFrame(page, "# Themed\n<button>Primary action</button>");
  const ui = page.frameLocator("iframe").first();
  const scope = ui.locator(".dil-scope").first();
  await expect(scope).toHaveAttribute("data-theme", "light");
  await expect(scope).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const frame = page
    .frames()
    .find((frame) => frame.url().includes("frame.html"));
  await frame?.evaluate(() => Reflect.set(window, "sameDocument", true));
  await page.getByRole("button", { name: "Demo settings" }).click();
  await page
    .getByRole("button", { name: "Output appearance", exact: true })
    .click();
  await page.getByRole("radio", { name: "Dark output", exact: true }).click();
  await page.getByLabel("Output primary color").fill("#ff0000");
  await page.keyboard.press("Escape");
  await expect(scope).toHaveAttribute("data-theme", "dark");
  await expect(scope).toHaveCSS("color-scheme", "dark");
  await expect(scope).toHaveCSS("background-color", "rgb(23, 23, 23)");
  await expect(
    ui.getByRole("button", { name: "Primary action", exact: true }),
  ).toHaveCSS("background-color", "rgb(255, 0, 0)");
  // Host and frame agree on the color scheme, so the browser adds no opaque backdrop.
  await expect(page.locator("iframe").first()).toHaveCSS(
    "color-scheme",
    "dark",
  );
  expect(await frame?.evaluate(() => Reflect.get(window, "sameDocument"))).toBe(
    true,
  );
});
// The trigger ends a short message, so there is more room above it in the
// content-sized frame than below it.
const SHORT_POPOVER =
  "Plan summary\n\nEight seats, billed monthly.\n\n<popover><popover-trigger><button>Details</button></popover-trigger><popover-content><text>First popover line</text><text>Second line</text><text>Third line</text></popover-content></popover>";
/** Opens the popover and waits until the frame fully contains it. */
async function openFramedPopover(page: Page) {
  const ui = page.frameLocator("iframe").first();
  const frame = page.locator("iframe").first();
  const frameHeight = () =>
    frame.evaluate((element) => (element as HTMLIFrameElement).offsetHeight);
  // The frame first shrinks from the previous document to this short one.
  await expect(ui.getByText("Eight seats, billed monthly.")).toBeVisible();
  const contentHeight = await ui
    .locator("#root")
    .evaluate((element) => element.scrollHeight);
  await expect.poll(frameHeight).toBe(contentHeight);
  const closed = await frameHeight();
  expect(closed).toBeLessThan(150);
  await ui.getByRole("button", { name: "Details", exact: true }).click();
  const popover = ui.locator('[data-slot="popover-content"]');
  await expect(popover).toBeVisible();
  await expect
    .poll(async () => {
      const [content, outer] = await Promise.all([
        popover.boundingBox(),
        frame.boundingBox(),
      ]);
      return (
        !!content &&
        !!outer &&
        content.y >= outer.y &&
        content.y + content.height <= outer.y + outer.height
      );
    })
    .toBe(true);
  // It opens below its trigger, on its preferred side, instead of flipping
  // above it where the frame's top would clip it.
  await expect(popover).toHaveAttribute("data-side", "bottom");
  expect(await frameHeight()).toBeGreaterThan(closed + 60);
  // Consecutive text lines stack instead of running together.
  const lines = await popover
    .locator('[data-d-component="text"]')
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().top),
    );
  expect(lines).toHaveLength(3);
  expect(new Set(lines).size).toBe(3);
  return { ui, frame, popover };
}
test("a popover in a short message grows the frame instead of being clipped", async ({
  page,
}) => {
  await runInFrame(page, SHORT_POPOVER);
  const { ui, frame, popover } = await openFramedPopover(page);
  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
  // Closing returns the frame to its content height.
  const content = await ui
    .locator("#root")
    .evaluate((element) => element.scrollHeight);
  await expect
    .poll(() =>
      frame.evaluate((element) => (element as HTMLIFrameElement).offsetHeight),
    )
    .toBe(content);
});
test("a popover in a short frame at the bottom of its scroller opens below and grows the frame", async ({
  page,
}) => {
  await runInFrame(page, SHORT_POPOVER);
  const ui = page.frameLocator("iframe").first();
  await expect(
    ui.getByRole("button", { name: "Details", exact: true }),
  ).toBeVisible();
  // End the preview pane right below the frame, like the newest answer in a
  // chat log, so there is no visible room below the trigger.
  await page
    .locator("iframe")
    .first()
    .evaluate((frame) => {
      const pane = frame.closest<HTMLElement>(".od-hero-output");
      if (!pane) throw new Error("Missing preview pane");
      const bottom = frame.getBoundingClientRect().bottom;
      pane.style.height = bottom - pane.getBoundingClientRect().top + "px";
      pane.style.flex = "none";
    });
  await openFramedPopover(page);
});
test("a slow runtime download is not reported as a missing runtime", async ({
  page,
}) => {
  const logs: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("OpenDIL")) logs.push(message.text());
  });
  // Hold frame.js the way a slow mobile link would, past every startup limit.
  let release = () => {};
  const released = new Promise<void>((resolve) => (release = resolve));
  let requested = () => {};
  const downloading = new Promise<void>((resolve) => (requested = resolve));
  await page.route("**/opendil/frame.js", async (route) => {
    requested();
    await released;
    await route.continue();
  });
  await page.clock.install();
  await openShowcaseWithoutFrame(page);
  await downloading;
  // frame.html pings before it requests frame.js; let that ping arrive.
  await page.waitForTimeout(500);
  await page.clock.fastForward(60_000);
  await page.waitForTimeout(500);
  await expect(page.locator("[data-dil-message] [role=alert]")).toHaveCount(0);
  await expect(page.locator("iframe").first()).toHaveCSS("display", "block");
  release();
  await expect(
    page.frameLocator("iframe").first().locator(".dil-document"),
  ).toBeAttached();
  expect(logs).toEqual([]);
});
test("a mounted frame reconnects to a renderer that asks again", async ({
  page,
}) => {
  await runInFrame(page, "First connection.");
  const ui = page.frameLocator("iframe").first();
  await expect(
    ui.getByText("First connection.", { exact: true }),
  ).toBeVisible();
  // What a renderer does when its effect restarts while the frame document stays
  // mounted, as under React <Activity>: ask, then connect a fresh channel.
  const reply = await page.evaluate(async () => {
    const target = document.querySelector("iframe")?.contentWindow;
    if (!target) throw new Error("Missing frame");
    const announced = new Promise<{ instance?: unknown }>((resolve) =>
      window.addEventListener("message", (event: MessageEvent) => {
        if (event.source === target && event.data?.type === "dil-ready")
          resolve(event.data as { instance?: unknown });
      }),
    );
    target.postMessage({ type: "dil-hello" }, "*");
    const ready = await announced;
    const channel = new MessageChannel();
    const height = new Promise<unknown>((resolve) => {
      channel.port1.onmessage = (event: MessageEvent) => {
        if (event.data?.type === "height") resolve(event.data.height);
      };
    });
    target.postMessage(
      { type: "dil-init" },
      { targetOrigin: "*", transfer: [channel.port2] },
    );
    // A reconnecting renderer resends its whole source and current theme.
    channel.port1.postMessage({ type: "source", suffix: "First connection." });
    channel.port1.postMessage({
      type: "theme",
      appearance: "dark",
      tokens: {},
    });
    return { instance: ready.instance, height: await height };
  });
  expect(typeof reply.instance).toBe("string");
  expect(reply.height).toBeGreaterThan(0);
  // The new channel drives the frame, and the resent source replaced the old one
  // instead of being appended to it, which the renderer would reject.
  await expect(ui.locator(".dil-scope").first()).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await expect(
    ui.getByText("First connection.", { exact: true }),
  ).toBeVisible();
  await expect(ui.getByRole("alert")).toHaveCount(0);
});
