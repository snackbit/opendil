import { test, expect } from "@playwright/test";
import { openShowcase, replaceSource } from "./dil-page";
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
      rendered:
        frames.unsandboxed.contentDocument?.getElementById("root")
          ?.childElementCount,
    };
  }, src);
  expect(ready.sandboxed).toBeGreaterThan(0);
  expect(ready.unsandboxed).toBe(0);
  expect(ready.rendered).toBe(0);
});
test("typing cannot write the clipboard; activating a document button can", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/demo/form/");
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
  const src = await page.locator("iframe").first().getAttribute("src");
  const replies = await page.evaluate(
    async (vm) => {
      type Reply = { error?: string; fatal?: string; value?: unknown };
      const run = async (sources: string[]) => {
        const worker = new Worker(vm);
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
        failed: await run([`JSON.stringify(${nested})`, "1+1"]),
      };
    },
    new URL("vm.js", new URL(src ?? "", page.url())).href,
  );
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
