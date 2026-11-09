import { expect, test, type Locator, type Page } from "@playwright/test";
import { closeSettings, replaceSource } from "./site-demo-page";

/*
 * interaction-cost.spec.ts: what one slider step costs in Host DOM mode, counted
 * rather than timed. A step sends one message to the expression runtime, whose
 * reply carries every result the step changed, and reaches the screen in one
 * React commit after the control's own.
 */

/** Counts React commits and expression-runtime messages in the page. */
async function countWork(page: Page) {
  await page.addInitScript(() => {
    const counts = { commits: 0, posts: 0 };
    const renderers = new Map<number, unknown>();
    Reflect.set(window, "__REACT_DEVTOOLS_GLOBAL_HOOK__", {
      renderers,
      supportsFiber: true,
      inject(renderer: unknown) {
        renderers.set(renderers.size + 1, renderer);
        return renderers.size;
      },
      onScheduleFiberRoot() {},
      onCommitFiberRoot() {
        counts.commits++;
      },
      onCommitFiberUnmount() {},
      onPostCommitFiberRoot() {},
      checkDCE() {},
      isDisabled: false,
    });
    const post = Worker.prototype.postMessage;
    Object.defineProperty(Worker.prototype, "postMessage", {
      configurable: true,
      value(this: Worker, message: unknown, ...rest: unknown[]) {
        const type =
          message && typeof message === "object"
            ? Reflect.get(message, "type")
            : undefined;
        // The parser worker receives plain text input; these are runtime jobs.
        if (type === "call" || type === "batch") counts.posts++;
        Reflect.apply(post, this, [message, ...rest]);
      },
    });
    Reflect.set(window, "workCounts", () => {
      const current = { ...counts };
      counts.commits = 0;
      counts.posts = 0;
      return current;
    });
  });
}
function takeCounts(page: Page) {
  return page.evaluate(() =>
    (
      Reflect.get(window, "workCounts") as () => {
        commits: number;
        posts: number;
      }
    )(),
  );
}
/** Presses the arrow key once and returns what the step cost once it settled. */
async function step(page: Page, slider: Locator, bound: Locator, want: string) {
  await takeCounts(page);
  await slider.press("ArrowRight");
  await expect(bound).toHaveText(want);
  // Late work, such as a result that arrives after the bound value, counts too.
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        setTimeout(() => requestAnimationFrame(() => done()), 150),
      ),
  );
  return takeCounts(page);
}

test("a slider step costs one runtime message and one commit after the control's", async ({
  page,
}) => {
  await countWork(page);
  await page.goto("demo/deployment/");
  await page
    .getByRole("button", { name: "Demo settings", exact: true })
    .click();
  await page.getByRole("radio", { name: "Host DOM", exact: true }).click();
  await closeSettings(page);
  const output = page.locator('.od-hero-output [data-dil-mode="host"]').first();
  const editor = page.getByRole("textbox", { name: "DIL source", exact: true });
  await replaceSource(
    page,
    editor,
    [
      "{@body const [seats, setSeats] = DIL.useState(8)}",
      "{@body const [other, setOther] = DIL.useState(1)}",
      '<slider aria-label="Seats" min={1} max={30} value={seats} onChange={setSeats}/>',
      "<text>Seats {seats}</text>",
      "<text>Monthly {seats * 29}</text>",
      "<text>Other {other}</text>",
    ].join("\n\n"),
  );
  const slider = output.getByRole("slider", { name: "Seats" });
  await expect(output.getByText("Monthly 232", { exact: true })).toBeVisible();
  await expect(output.locator('[data-dil-settled="true"]')).toHaveCount(1);
  await slider.focus();
  const bound = output.getByText(/^Monthly \d+$/);
  for (const seats of [9, 10, 11]) {
    const cost = await step(page, slider, bound, `Monthly ${seats * 29}`);
    expect(cost.posts).toBe(1);
    expect(cost.commits).toBeLessThanOrEqual(2);
  }
});

test("the landing budget's slider sends one runtime message per step", async ({
  page,
}) => {
  await countWork(page);
  await page.goto("");
  const slider = page.getByRole("slider", { name: "Team members" }).first();
  await expect(slider).toBeEnabled();
  const total = page.getByText(/^€\d+\.\d\d$/).first();
  await expect(total).toHaveText("€232.00");
  await slider.focus();
  for (const seats of [9, 10]) {
    // The chart's own layout effects add commits of their own, so only the
    // runtime traffic is fixed here.
    const cost = await step(page, slider, total, `€${(seats * 29).toFixed(2)}`);
    expect(cost.posts).toBe(1);
  }
});
